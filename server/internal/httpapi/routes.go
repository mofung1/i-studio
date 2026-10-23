// Package httpapi owns Gin routing, middleware and the API response contract.
package httpapi

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// NewRouter owns HTTP routing and middleware. Domain handlers retain net/http
// signatures so streaming, multipart uploads and worker tests share the same code.
func NewRouter(s Handlers) *gin.Engine {
	router := gin.New()
	// Forwarded headers are handled by the existing, explicitly configured auth
	// source policy. Never enable Gin's default trust of arbitrary proxies.
	_ = router.SetTrustedProxies(nil)
	router.HandleMethodNotAllowed = true
	router.RedirectTrailingSlash = false
	router.Use(s.recoverRequests(), corsMiddleware())
	router.NoRoute(s.routeError(http.StatusNotFound))
	router.NoMethod(s.routeError(http.StatusMethodNotAllowed))

	api := router.Group("/v1")
	api.GET("/health", gin.WrapF(s.Health))
	api.GET("/operation-settings", gin.WrapF(s.PublicOperationSettings))
	api.GET("/account", gin.WrapF(s.AccountHandler))
	registerMethods(api, "/account/checkin", s.AccountCheckin, "GET", "POST")

	auth := api.Group("/auth")
	auth.POST("/register", gin.WrapF(s.Register))
	auth.POST("/login", gin.WrapF(s.Login))
	auth.GET("/me", gin.WrapF(s.Me))
	api.POST("/admin/auth/login", gin.WrapF(s.AdminLogin))
	api.GET("/admin/auth/me", gin.WrapF(s.AdminMe))

	s.registerGenerationRoutes(api)
	s.registerLibraryRoutes(api)
	s.registerPromptRoutes(api)
	s.registerSettingsRoutes(api)
	s.registerInspirationRoutes(api)
	s.registerAdminRoutes(api.Group("/admin", s.adminMiddleware()))
	return router
}

func (s Handlers) registerGenerationRoutes(api *gin.RouterGroup) {
	generation := api.Group("/generation")
	generation.GET("/capabilities", gin.WrapF(s.Capabilities))
	generation.POST("/validate", gin.WrapF(s.Validate))
	generation.GET("/quote", gin.WrapF(s.GenerationQuote))
	registerMethods(generation, "/tasks", s.TasksHandler, "GET", "POST")
	registerMethods(generation, "/tasks/:id", s.TaskByID, "GET", "DELETE")
	generation.GET("/tasks/:id/download", gin.WrapF(s.TaskByID))
	generation.POST("/tasks/:id/retry", gin.WrapF(s.TaskByID))

	api.POST("/clothing/plan", gin.WrapF(s.ClothingPlanHandler))
	api.POST("/clothing/manual-plan", gin.WrapF(s.ManualClothingPlan))
}

func (s Handlers) registerLibraryRoutes(api *gin.RouterGroup) {
	registerMethods(api, "/projects", s.Projects, "GET", "POST")
	registerMethods(api, "/projects/:id", s.ProjectByID, "PATCH", "DELETE")
	registerMethods(api, "/library/assets", s.LibraryAssets, "GET", "PATCH")
	api.POST("/library/download", gin.WrapF(s.LibraryDownload))
	api.POST("/assets", gin.WrapF(s.Assets))
	registerMethods(api, "/assets/:id", s.AssetContent, "GET", "DELETE")
	registerMethods(api, "/assets/:id/content", s.AssetContent, "GET", "DELETE")
	api.GET("/assets/:id/metadata", gin.WrapF(s.AssetMetadata))
	api.GET("/assets/:id/thumbnail", gin.WrapF(s.AssetThumbnail))
}

func (s Handlers) registerPromptRoutes(api *gin.RouterGroup) {
	prompts := api.Group("/prompts")
	prompts.POST("/enhance", gin.WrapF(s.PromptEnhance))
	prompts.POST("/format", gin.WrapF(s.FormatPrompt))
	registerMethods(prompts, "/reverse", s.PromptReverseTasks, "GET", "POST")
	prompts.GET("/reverse/capabilities", gin.WrapF(s.PromptReverseCapabilities))
	registerMethods(prompts, "/reverse/:id", s.PromptReverseByID, "GET", "DELETE")
	prompts.GET("/reverse/:id/image", gin.WrapF(s.PromptReverseByID))
	prompts.POST("/reverse/:id/cancel", gin.WrapF(s.PromptReverseByID))

	personal := api.Group("/personal")
	registerMethods(personal, "/prompts", s.PersonalPrompts, "GET", "POST")
	registerMethods(personal, "/prompts/:id", s.PersonalPromptByID, "GET", "PUT", "PATCH", "DELETE")
	personal.GET("/prompts/:id/versions", gin.WrapF(s.PersonalPromptByID))
	personal.POST("/prompts/:id/restore", gin.WrapF(s.PersonalPromptByID))
}

// Legacy settings URLs remain permission checked by their handlers. The admin
// URLs below point to those same handlers, rather than duplicating persistence.
func (s Handlers) registerSettingsRoutes(api *gin.RouterGroup) {
	endpoints := api.Group("/ai-endpoints", s.auditConfiguration("ai-endpoints"))
	registerMethods(endpoints, "", s.AIEndpoints, "GET", "POST")
	registerMethods(endpoints, "/:id", s.AIEndpointByID, "PUT", "DELETE")
	endpoints.POST("/:id/default", gin.WrapF(s.AIEndpointByID))
	endpoints.POST("/:id/test", gin.WrapF(s.AIEndpointByID))
	for _, editor := range []struct {
		path    string
		handler http.HandlerFunc
	}{
		{"prompt-templates", s.PromptTemplates},
		{"prompt-reverse-settings", s.PromptReverseSettingsHandler},
		{"site-settings", s.SiteSettingsHandler},
	} {
		group := api.Group("/"+editor.path, s.auditConfiguration(editor.path))
		registerMethods(group, "", editor.handler, "GET", "PUT")
	}
	registerMethods(api, "/site-settings/logo/:filename", s.SiteLogo, "GET", "HEAD")
	registerMethods(api, "/site-settings/contact/:filename", s.SiteLogo, "GET", "HEAD")
}

func (s Handlers) registerInspirationRoutes(api *gin.RouterGroup) {
	inspiration := api.Group("/inspiration")
	prompts := inspiration.Group("/prompts", s.auditConfiguration("inspiration/prompts"))
	registerMethods(prompts, "", s.InspirationPrompts, "GET", "POST")
	registerMethods(prompts, "/:id", s.InspirationPromptByID, "PUT", "DELETE")
	categories := inspiration.Group("/categories", s.auditConfiguration("inspiration/categories"))
	registerMethods(categories, "", s.InspirationCategories, "GET", "POST")
	registerMethods(categories, "/:id", s.InspirationCategoryByID, "PUT", "DELETE")
	registerMethods(inspiration, "/images/*key", s.InspirationImage, "GET", "HEAD")
}

func registerMethods(group *gin.RouterGroup, path string, handler http.HandlerFunc, methods ...string) {
	for _, method := range methods {
		group.Handle(method, path, gin.WrapF(handler))
	}
}

func (s Handlers) routeError(status int) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Gin's NoRoute/NoMethod run outside group middleware. Keep the admin
		// boundary intact for unknown paths and unsupported methods as well.
		if strings.HasPrefix(c.Request.URL.Path, "/v1/admin/") || c.Request.URL.Path == "/v1/admin" {
			if !s.allowAdminRequest(c) {
				return
			}
		}
		if status == http.StatusMethodNotAllowed {
			Error(c.Writer, status, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		} else {
			Error(c.Writer, status, "NOT_FOUND", "页面不存在")
		}
	}
}
