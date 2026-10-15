-- Separate operator credentials from customers without moving their assets or wallets.
BEGIN;
SELECT pg_advisory_xact_lock(79140003);
CREATE TABLE IF NOT EXISTS admin_users (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'admin' CHECK(role='admin'),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 auth_version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS administrator_environment (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 admin_id TEXT NOT NULL UNIQUE REFERENCES admin_users(id)
);
ALTER TABLE operation_settings ADD COLUMN IF NOT EXISTS admin_auth_migrated BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
 IF NOT (SELECT admin_auth_migrated FROM operation_settings WHERE id=true) THEN
  INSERT INTO admin_users(id,username,password_hash,status,auth_version,created_at)
   SELECT id,username,password_hash,status,auth_version,created_at FROM users WHERE role='admin'
   ON CONFLICT DO NOTHING;
  IF to_regclass('environment_admin') IS NOT NULL THEN
   INSERT INTO administrator_environment(id,admin_id)
    SELECT true,e.user_id FROM environment_admin e JOIN admin_users a ON a.id=e.user_id
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE users SET role='user',auth_version=auth_version+1 WHERE role='admin';
  UPDATE operation_settings SET admin_auth_migrated=true WHERE id=true;
 END IF;
END $$;
DROP TABLE IF EXISTS environment_admin;
COMMIT;
