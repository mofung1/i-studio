package studio

import (
	"net/http"
	"time"

	"github.com/istudio/server/internal/database"
)

func (s *Service) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	dbStatus := database.Status(s.db)
	status, code := "ok", http.StatusOK
	if dbStatus == "unavailable" {
		status, code = "unavailable", http.StatusServiceUnavailable
	}
	s.json(w, code, map[string]any{"service": "istudio-server", "status": status, "database": dbStatus, "aiProviderConfigured": s.ai != nil && s.ai.hasAny("image"), "timestamp": time.Now().UTC().Format(time.RFC3339)})
}
