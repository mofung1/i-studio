package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type environmentAdminConfig struct {
	Username string
	Password string
}

func readEnvironmentAdminConfig() (environmentAdminConfig, error) {
	c := environmentAdminConfig{
		Username: strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_USERNAME"))),
		Password: os.Getenv("ADMIN_PASSWORD"),
	}
	if c.Username == "" && c.Password == "" {
		return c, nil
	}
	if !validUsername(c.Username) {
		return c, errors.New("ADMIN_USERNAME 需为 3–32 位字母、数字或下划线")
	}
	if len(c.Password) < 12 || len(c.Password) > 128 || strings.TrimSpace(c.Password) == "" || strings.ContainsAny(c.Password, "\x00\r\n") {
		return c, errors.New("ADMIN_PASSWORD 需为 12–128 位，且不能包含换行")
	}
	return c, nil
}

// A deployment may own one administrator through its environment. Bind by user
// ID so renaming does not transfer another user's assets, balance or privileges.
// Never log the configuration or include a password in returned errors.
func (s *server) syncEnvironmentAdmin() error {
	c, err := readEnvironmentAdminConfig()
	if err != nil {
		return err
	}
	if s.db == nil {
		if c.Username == "" {
			return nil
		}
		return errors.New("环境变量管理员需要 PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("管理员初始化事务失败: %w", err)
	}
	defer tx.Rollback()
	// Share the role-management lock with the admin API.
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(79140002)"); err != nil {
		return fmt.Errorf("管理员初始化锁失败: %w", err)
	}
	var boundID string
	err = tx.QueryRowContext(ctx, "SELECT user_id FROM environment_admin WHERE id=true FOR UPDATE").Scan(&boundID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("管理员初始化记录读取失败: %w", err)
	}
	if c.Username == "" {
		if boundID == "" {
			return nil
		}
		if _, err = tx.ExecContext(ctx, "DELETE FROM environment_admin WHERE id=true"); err != nil {
			return err
		}
		if err = auditEnvironmentAdmin(ctx, tx, "admin.environment.release", boundID); err != nil {
			return err
		}
		// Removing the environment binding does not delete or demote the account.
		return tx.Commit()
	}

	var u user
	if boundID != "" {
		err = tx.QueryRowContext(ctx, "SELECT id,username,password_hash,role,status,auth_version FROM users WHERE id=$1 FOR UPDATE", boundID).
			Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Status, &u.AuthVersion)
	} else {
		err = tx.QueryRowContext(ctx, "SELECT id,username,password_hash,role,status,auth_version FROM users WHERE username=$1 FOR UPDATE", c.Username).
			Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Status, &u.AuthVersion)
	}
	if errors.Is(err, sql.ErrNoRows) && boundID == "" {
		id := randomID()
		if _, err = tx.ExecContext(ctx, "INSERT INTO users(id,username,password_hash,role) VALUES($1,$2,$3,'admin')", id, c.Username, hashPassword(c.Password)); err != nil {
			return errors.New("环境变量管理员创建失败，请确认用户名未被占用")
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO credit_accounts(user_id) VALUES($1)", id); err != nil {
			return fmt.Errorf("管理员余额账户创建失败: %w", err)
		}
		if err = bindEnvironmentAdmin(ctx, tx, id); err != nil {
			return err
		}
		if err = auditEnvironmentAdmin(ctx, tx, "admin.environment.create", id); err != nil {
			return err
		}
		return tx.Commit()
	}
	if err != nil {
		return fmt.Errorf("环境变量管理员读取失败: %w", err)
	}
	passwordMatches := checkPassword(c.Password, u.PasswordHash)
	if boundID == "" && !passwordMatches {
		return errors.New("ADMIN_USERNAME 已被已有账号占用，请填写该账号当前密码或使用未占用的用户名；不会覆盖已有账号密码")
	}
	var nameTaken bool
	if err = tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE username=$1 AND id<>$2)", c.Username, u.ID).Scan(&nameTaken); err != nil {
		return fmt.Errorf("管理员用户名检查失败: %w", err)
	}
	if nameTaken {
		return errors.New("ADMIN_USERNAME 已被其他账号占用，不会覆盖该账号")
	}
	changed := u.Username != c.Username || !passwordMatches || u.Role != "admin" || u.Status != "active"
	if changed {
		passwordHash := u.PasswordHash
		if !passwordMatches {
			passwordHash = hashPassword(c.Password)
		}
		if _, err = tx.ExecContext(ctx, "UPDATE users SET username=$2,password_hash=$3,role='admin',status='active',auth_version=auth_version+1 WHERE id=$1", u.ID, c.Username, passwordHash); err != nil {
			return errors.New("环境变量管理员更新失败，请检查账号配置")
		}
	}
	if boundID == "" {
		if err = bindEnvironmentAdmin(ctx, tx, u.ID); err != nil {
			return err
		}
	}
	if changed || boundID == "" {
		if err = auditEnvironmentAdmin(ctx, tx, "admin.environment.update", u.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func bindEnvironmentAdmin(ctx context.Context, tx *sql.Tx, id string) error {
	if _, err := tx.ExecContext(ctx, "INSERT INTO environment_admin(id,user_id) VALUES(true,$1)", id); err != nil {
		return fmt.Errorf("环境变量管理员绑定失败: %w", err)
	}
	return nil
}

func auditEnvironmentAdmin(ctx context.Context, tx *sql.Tx, action, id string) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES('environment-bootstrap',$1,$2,'环境变量管理员配置变更')", action, id)
	return err
}

func tokenVersionMatches(payload map[string]any, u user) bool {
	version, exists := payload["ver"]
	if !exists {
		return u.AuthVersion == 0 // Existing sessions remain valid until credentials change.
	}
	number, ok := version.(float64)
	return ok && number >= 0 && number == float64(u.AuthVersion)
}
