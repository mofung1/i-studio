// Package app composes the API process and deployment commands.
package app

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/config"
	"github.com/istudio/server/internal/database"
	"github.com/istudio/server/internal/storage"
	"github.com/istudio/server/internal/studio"
)

// Run returns an exit code so the process boundary is the only caller of os.Exit.
func Run(args []string) int {
	config.LoadDotEnv()
	if len(args) > 0 {
		switch args[0] {
		case "admin":
			return runAdminCommand(args[1:])
		case "seed-inspiration":
			return runInspirationSeed(args[1:])
		case "bootstrap-inspiration":
			return runCatalogBootstrap(args[1:])
		case "-h", "--help":
			fmt.Fprintln(os.Stdout, "用法: istudio-server [admin --username 用户名 | seed-inspiration -h | bootstrap-inspiration -h]")
			return 0
		default:
			fmt.Fprintln(os.Stderr, "未知命令，请使用 --help 查看用法")
			return 2
		}
	}
	if err := serve(config.FromEnvironment()); err != nil {
		fmt.Fprintln(os.Stderr, "API 启动失败:", err)
		return 1
	}
	return 0
}

func serve(cfg config.Runtime) error {
	if os.Getenv(gin.EnvGinMode) == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	db, err := database.Open(cfg.DatabaseURL)
	if err != nil || db == nil {
		return errors.New("运营模式需要可用的 DATABASE_URL，禁止回退到内存账户")
	}
	defer db.Close()
	if err := database.Migrate(db); err != nil {
		return fmt.Errorf("database migration: %w", err)
	}
	root := cfg.StorageRoot
	secret, err := auth.LoadSecret(root)
	if err != nil {
		return fmt.Errorf("auth signing key: %w", err)
	}
	service, err := studio.New(studio.Dependencies{
		Database: db, Storage: storage.NewLocal(root), StorageRoot: root, AuthSecret: secret,
	})
	if err != nil {
		return err
	}
	service.StartWorkers()
	httpServer := &http.Server{
		Addr:              cfg.ListenAddress(),
		Handler:           service.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      11 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	fmt.Printf("iStudio Gin API listening on %s\n", cfg.ListenAddress())
	return httpServer.ListenAndServe()
}
