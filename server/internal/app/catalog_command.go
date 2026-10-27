package app

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/istudio/server/internal/config"
	"github.com/istudio/server/internal/database"
	"github.com/istudio/server/internal/inspiration"
)

func runCatalogBootstrap(args []string) int {
	flags := flag.NewFlagSet("bootstrap-inspiration", flag.ContinueOnError)
	manifest := flags.String("catalog", "", "公开灵感库清单路径")
	images := flags.String("images", "", "内置公共封面目录")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	if *manifest == "" || *images == "" || flags.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "请同时提供 --catalog 和 --images")
		return 2
	}
	catalog, err := inspiration.LoadCatalog(*manifest)
	if err != nil {
		fmt.Fprintln(os.Stderr, "读取内置灵感库失败:", err)
		return 1
	}
	db, err := database.Open(config.Env("DATABASE_URL", ""))
	if err != nil || db == nil {
		fmt.Fprintln(os.Stderr, "初始化灵感库需要可用的 DATABASE_URL")
		return 1
	}
	defer db.Close()
	if err := database.Migrate(db); err != nil {
		fmt.Fprintln(os.Stderr, "迁移数据库失败:", err)
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	result, err := inspiration.BootstrapCatalog(ctx, db, catalog, *images, config.Env("STORAGE_ROOT", "storage/uploads"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "初始化内置灵感库失败:", err)
		return 1
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		return 1
	}
	return 0
}
