package studio

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/istudio/server/internal/httpapi"
)

func (s *Service) router() *gin.Engine {
	return httpapi.NewRouter(httpapi.Handlers{
		AuthorizeAdmin: s.authorizeAdmin,
		ConfigurationChanged: func(r *http.Request, action, target, detail string) {
			if actor, ok := s.currentAdministrator(r); ok {
				s.audit(actor.ID, action, target, detail)
			}
		},
		AccountHandler:               s.accountHandler,
		AdminAudit:                   s.adminAudit,
		AdminLogin:                   s.adminLogin,
		AdminMe:                      s.adminMe,
		AdminModels:                  s.adminModels,
		AdminOverview:                s.adminOverview,
		AdminMonitoring:              s.adminMonitoring,
		AdminImageMeasurements:       s.adminImageMeasurements,
		AdminSettings:                s.adminSettings,
		AdminStorage:                 s.adminStorage,
		AdminTasks:                   s.adminTasks,
		AdminUsers:                   s.adminUsers,
		AIEndpointByID:               s.aiEndpointByID,
		AIEndpoints:                  s.aiEndpoints,
		AssetContent:                 s.assetContent,
		AssetMetadata:                s.assetMetadata,
		AssetThumbnail:               s.assetThumbnail,
		Assets:                       s.assets,
		Capabilities:                 s.capabilities,
		ClothingPlanHandler:          s.clothingPlanHandler,
		FormatPrompt:                 s.formatPrompt,
		GenerationQuote:              s.generationQuote,
		Health:                       s.health,
		InspirationCategories:        s.inspirationCategories,
		InspirationCategoryByID:      s.inspirationCategoryByID,
		InspirationImage:             s.inspirationImage,
		InspirationPromptByID:        s.inspirationPromptByID,
		InspirationPrompts:           s.inspirationPrompts,
		LibraryAssets:                s.libraryAssets,
		LibraryDownload:              s.libraryDownload,
		Login:                        s.login,
		ManualClothingPlan:           s.manualClothingPlan,
		Me:                           s.me,
		PersonalPromptByID:           s.personalPromptByID,
		PersonalPrompts:              s.personalPrompts,
		ProjectByID:                  s.projectByID,
		Projects:                     s.projects,
		PromptEnhance:                s.promptEnhance,
		PromptReverseByID:            s.promptReverseByID,
		PromptReverseCapabilities:    s.promptReverseCapabilities,
		PromptReverseSettingsHandler: s.promptReverseSettingsHandler,
		PromptReverseTasks:           s.promptReverseTasks,
		PromptTemplates:              s.promptTemplates,
		PublicOperationSettings:      s.publicOperationSettings,
		Register:                     s.register,
		SiteLogo:                     s.siteLogo,
		SiteSettingsHandler:          s.siteSettingsHandler,
		TaskByID:                     s.taskByID,
		TasksHandler:                 s.tasksHandler,
		Validate:                     s.validate,
	})
}

// Handler exposes only the HTTP boundary to the process composition root.
func (s *Service) Handler() http.Handler { return s.router() }

func (s *Service) authorizeAdmin(w http.ResponseWriter, r *http.Request) bool {
	if !s.requireAdmin(w, r) {
		return false
	}
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "运营后台需要 PostgreSQL 数据库")
		return false
	}
	return true
}
