package httpapi

import (
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	runtimeconfig "github.com/istudio/server/internal/config"
)

func corsMiddleware() gin.HandlerFunc {
	allowedOrigins := make(map[string]struct{})
	for _, origin := range strings.Split(runtimeconfig.Env("WEB_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000"), ",") {
		allowedOrigins[strings.TrimSpace(origin)] = struct{}{}
	}
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Add("Vary", "Origin")
		// Browser caches must not reuse a private image for another bearer token.
		c.Writer.Header().Add("Vary", "Authorization")
		origin := c.GetHeader("Origin")
		if _, ok := allowedOrigins[origin]; origin != "" && ok {
			c.Header("Access-Control-Allow-Origin", origin)
		}
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-Expected-Unit-Price")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (s Handlers) recoverRequests() gin.HandlerFunc {
	// Gin's default recovery prints request headers. Avoid logging credentials,
	// request bodies or provider errors containing private configuration.
	return gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, _ any) {
		log.Printf("request panic: %s %s", c.Request.Method, c.FullPath())
		if !c.Writer.Written() {
			Error(c.Writer, http.StatusInternalServerError, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试")
		}
		c.Abort()
	})
}

func (s Handlers) allowAdminRequest(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store")
	if !s.AuthorizeAdmin(c.Writer, c.Request) {
		c.Abort()
		return false
	}

	return true
}

func (s Handlers) adminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if s.allowAdminRequest(c) {
			c.Next()
		}
	}
}

func (s Handlers) auditConfiguration(prefix string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead && c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
			path := strings.TrimPrefix(strings.TrimPrefix(c.Request.URL.Path, "/v1/"), "admin/")
			target := strings.Trim(strings.TrimPrefix(path, prefix), "/")
			detail := "配置已更新"
			if c.Request.Method == http.MethodDelete {
				detail = "已删除"
			} else if prefix == "ai-endpoints" && strings.HasSuffix(path, "/test") {
				detail = "已执行服务连接测试"
			} else if prefix == "ai-endpoints" && strings.HasSuffix(path, "/default") {
				detail = "已切换默认服务"
			}
			if target == "" {
				target = prefix
			}
			s.ConfigurationChanged(c.Request, c.Request.Method+" "+prefix, target, detail)
		}
	}
}
