package studio

import (
	"github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
)

func (s *Service) token(u domain.User) string                 { return auth.Sign(s.secret, u) }
func (s *Service) verify(token string) (map[string]any, bool) { return auth.Verify(s.secret, token) }
