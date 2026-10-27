package app

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	authn "github.com/istudio/server/internal/auth"
	runtimeconfig "github.com/istudio/server/internal/config"
	"github.com/istudio/server/internal/database"
	"github.com/istudio/server/internal/repository"
)

// Only explicit deployment commands can grant the initial administrator role.
func runAdminCommand(args []string) int {
	flags := flag.NewFlagSet("admin", flag.ContinueOnError)
	username := flags.String("username", "", "后台管理员用户名")
	passwordStdin := flags.Bool("password-stdin", false, "从标准输入读取独立管理员密码")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if !authn.ValidUsername(strings.ToLower(*username)) {
		fmt.Fprintln(os.Stderr, "用法: server admin --username 后台管理员用户名")
		return 2
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if *passwordStdin {
		raw, err := io.ReadAll(io.LimitReader(os.Stdin, 130))
		if err != nil {
			fmt.Fprintln(os.Stderr, "密码读取失败")
			return 2
		}
		password = strings.TrimSuffix(strings.TrimSuffix(string(raw), "\n"), "\r")
	}
	if !authn.ValidAdministratorPassword(password) {
		fmt.Fprintln(os.Stderr, "请通过 ADMIN_PASSWORD 或 --password-stdin 提供 6–128 位后台密码，且不能包含换行")
		return 2
	}
	db, err := database.Open(runtimeconfig.Env("DATABASE_URL", ""))
	if err != nil || db == nil {
		fmt.Fprintln(os.Stderr, "需要可用的 DATABASE_URL")
		return 1
	}
	defer db.Close()
	if err = database.Migrate(db); err != nil {
		fmt.Fprintln(os.Stderr, "数据库迁移失败:", err)
		return 1
	}
	err = repository.SetAdministrator(db, strings.ToLower(*username), authn.HashPassword(password))

	if err != nil {
		fmt.Fprintln(os.Stderr, "设置管理员失败:", err)
		return 1
	}
	fmt.Printf("独立后台账号 %s 已配置。\n", strings.ToLower(*username))
	return 0
}
