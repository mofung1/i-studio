package main

// Test sessions always refer to stored accounts, just like production tokens.
// Management fixtures grant an explicit role rather than relying on registration order.
func (s *server) testToken(u user) string {
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
			s.users = map[string]user{}
		}
		s.users[u.Username] = u
		s.mu.Unlock()
	}
	return s.token(u)
}
func (s *server) testAdminToken(u user) string {
	u.Role = "admin"
	token := s.testToken(u)
	if s.db != nil {
		if _, err := s.db.Exec("UPDATE users SET role='admin' WHERE id=$1", u.ID); err != nil {
			panic(err)
		}
	}
	return token
}
