package repository

import (
	"database/sql"
	"github.com/istudio/server/internal/idgen"
)

// SetAdministrator creates or rotates only an operator identity, with an atomic audit.
func SetAdministrator(db *sql.DB, username, passwordHash string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(79140002)"); err != nil {
		return err
	}
	var id string
	err = tx.QueryRow(`INSERT INTO admin_users(id,username,password_hash) VALUES($1,$2,$3)
 ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',auth_version=admin_users.auth_version+1 RETURNING id`, idgen.New(), username, passwordHash).Scan(&id)
	if err == nil {
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES('deployment-cli','admin.credentials',$1,'部署者设置独立后台账号')", id)
	}
	if err == nil {
		err = tx.Commit()
	}
	return err
}
