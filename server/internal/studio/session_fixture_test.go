package studio

import (
	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
)

// Test sessions always refer to stored accounts, just like production tokens.
// Management fixtures grant an explicit role rather than relying on registration order.
func (s *Service) testToken(u domain.User) string {
	if u.Username == "" {
		u.Username = u.ID
	}
	if u.Role == "" {
		u.Role = "user"
	}
	if u.Status == "" {
		u.Status = "active"
	}
	if s.db != nil {
		if _, err := s.db.Exec("INSERT INTO users(id,username,password_hash,role,status) VALUES($1,$2,'fixture',$3,$4) ON CONFLICT(id) DO NOTHING", u.ID, u.Username, u.Role, u.Status); err != nil {
			panic(err)
		}
		if _, err := s.db.Exec("INSERT INTO credit_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING", u.ID); err != nil {
			panic(err)
		}
	} else {
		s.mu.Lock()
		if s.users == nil {
			s.users = map[string]domain.User{}
		}
		s.users[u.Username] = u
		s.mu.Unlock()
	}
	return s.token(u)
}

func (s *Service) testAdminToken(u domain.User) string {
	u.Role = "admin"
	if u.Username == "" {
		u.Username = u.ID
	}
	if u.Status == "" {
		u.Status = "active"
	}
	if s.db != nil {
		if _, err := s.db.Exec("INSERT INTO admin_users(id,username,password_hash,status) VALUES($1,$2,'fixture',$3) ON CONFLICT(id) DO NOTHING", u.ID, u.Username, u.Status); err != nil {
			panic(err)
		}
	} else {
		s.mu.Lock()
		if s.administrators == nil {
			s.administrators = map[string]domain.User{}
		}
		s.administrators[u.Username] = u
		s.mu.Unlock()
	}
	return authn.SignForAudience(s.secret, u, "admin")
}
