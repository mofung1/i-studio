package httpapi

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (s Handlers) registerAdminRoutes(admin *gin.RouterGroup) {
	registerMethods(admin, "/inspiration-submission-settings", s.InspirationSubmissionSettings, "GET", "PUT")
	admin.GET("/inspiration-submissions", gin.WrapF(s.AdminInspirationSubmissions))
	admin.GET("/inspiration-submissions/:id", func(c *gin.Context) { s.AdminInspirationSubmissionByID(c.Writer, c.Request, c.Param("id"), "") })
	admin.GET("/inspiration-submissions/:id/cover", func(c *gin.Context) { s.AdminInspirationSubmissionByID(c.Writer, c.Request, c.Param("id"), "cover") })
	admin.POST("/inspiration-submissions/:id/review", func(c *gin.Context) { s.AdminInspirationSubmissionByID(c.Writer, c.Request, c.Param("id"), "review") })
	admin.POST("/inspiration-submissions/:id/unpublish", func(c *gin.Context) {
		s.AdminInspirationSubmissionByID(c.Writer, c.Request, c.Param("id"), "unpublish")
	})
	registerMethods(admin, "/settings", s.AdminSettings, "GET", "PUT")
	registerMethods(admin, "/storage", s.AdminStorage, "GET", "POST", "PUT")
	admin.GET("/overview", gin.WrapF(s.AdminOverview))
	admin.GET("/monitoring", gin.WrapF(s.AdminMonitoring))
	admin.GET("/tasks", gin.WrapF(s.AdminTasks))
	admin.GET("/audit", gin.WrapF(s.AdminAudit))

	measurements := func(c *gin.Context) { s.AdminImageMeasurements(c.Writer, c.Request, c.Param("id")) }
	admin.GET("/image-measurements", measurements)
	admin.PUT("/image-measurements/:id", measurements)
	models := func(c *gin.Context) { s.AdminModels(c.Writer, c.Request, c.Param("id")) }
	admin.GET("/models", models)
	admin.POST("/models", models)
	admin.PUT("/models/:id", models)
	users := func(c *gin.Context) {
		suffix := strings.TrimPrefix(c.Request.URL.Path, "/v1/admin/users")
		s.AdminUsers(c.Writer, c.Request, suffix)
	}
	admin.GET("/users", users)
	admin.PUT("/users/:id", users)
	admin.POST("/users/:id/balance", users)

	endpoints := admin.Group("/ai-endpoints", s.auditConfiguration("ai-endpoints"))
	registerAdminEditor(endpoints, "", s.AIEndpoints, "GET", "POST")
	registerAdminEditor(endpoints, "/:id", s.AIEndpointByID, "PUT", "DELETE")
	registerAdminEditor(endpoints, "/:id/default", s.AIEndpointByID, "POST")
	registerAdminEditor(endpoints, "/:id/test", s.AIEndpointByID, "POST")
	for _, editor := range []struct {
		path    string
		handler http.HandlerFunc
	}{
		{"prompt-templates", s.PromptTemplates},
		{"prompt-reverse-settings", s.PromptReverseSettingsHandler},
		{"site-settings", s.SiteSettingsHandler},
	} {
		group := admin.Group("/"+editor.path, s.auditConfiguration(editor.path))
		registerAdminEditor(group, "", editor.handler, "GET", "PUT")
	}
	for _, editor := range []struct {
		path       string
		collection http.HandlerFunc
		item       http.HandlerFunc
	}{
		{"inspiration/prompts", s.InspirationPrompts, s.InspirationPromptByID},
		{"inspiration/categories", s.InspirationCategories, s.InspirationCategoryByID},
	} {
		group := admin.Group("/"+editor.path, s.auditConfiguration(editor.path))
		registerAdminEditor(group, "", editor.collection, "GET", "POST")
		registerAdminEditor(group, "/:id", editor.item, "PUT", "DELETE")
	}
}

// Existing editors expect the /v1/... path. Clone only the URL so callers,
// middleware and audit logs continue seeing the original admin request.
func registerAdminEditor(group *gin.RouterGroup, path string, handler http.HandlerFunc, methods ...string) {
	for _, method := range methods {
		group.Handle(method, path, func(c *gin.Context) {
			request := c.Request.Clone(c.Request.Context())
			url := *request.URL
			url.Path = "/v1/" + strings.TrimPrefix(url.Path, "/v1/admin/")
			request.URL = &url
			handler(c.Writer, request)
		})
	}
}
