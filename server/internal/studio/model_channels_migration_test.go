package studio

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/istudio/server/internal/database"
)

func TestUnversionedDatabaseUpgradeAndMigrationReplay(t *testing.T) {
	db := isolatedDatabase(t, false)
	files, err := filepath.Glob("../database/migrations/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if filepath.Base(file) >= "011_model_channels.sql" {
			continue
		}
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(string(raw)); err != nil {
			t.Fatal(file, err)
		}
	}
	_, err = db.Exec(`INSERT INTO users(id,username,password_hash) VALUES('kept-user','kept-user','unused');
 INSERT INTO credit_accounts(user_id,available) VALUES('kept-user',12345);
 INSERT INTO public_models(id,name,endpoint_id,price_minor,enabled,is_default) VALUES('old-model','原模型','old-endpoint',125,true,true)`)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = database.Migrate(db); err != nil {
			t.Fatal(err)
		}
	}
	var oldColumn bool
	var available int64
	var enabled bool
	var name string
	if err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='public_models' AND column_name='endpoint_id')").Scan(&oldColumn); err != nil {
		t.Fatal(err)
	}
	if oldColumn {
		t.Fatal("old binding column recreated")
	}
	if err = db.QueryRow("SELECT available FROM credit_accounts WHERE user_id='kept-user'").Scan(&available); err != nil || available != 12345 {
		t.Fatal("unrelated wallet changed", available, err)
	}
	if err = db.QueryRow("SELECT enabled,name FROM public_models WHERE id='old-model'").Scan(&enabled, &name); err != nil || enabled || name != "原模型" {
		t.Fatal("old model not preserved as draft", err)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM schema_file_migrations").Scan(&count); err != nil || count != len(files) {
		t.Fatal("file migrations not tracked", count, err)
	}
	if err = db.QueryRow("SELECT count(*) FROM public_model_channels").Scan(&count); err != nil || count != 0 {
		t.Fatal("old binding was imported", count, err)
	}
	var deliveryTable, leaseColumn bool
	if err = db.QueryRow("SELECT to_regclass('generation_deliveries') IS NOT NULL,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='generation_tasks' AND column_name='lease_token')").Scan(&deliveryTable, &leaseColumn); err != nil || !deliveryTable || !leaseColumn {
		t.Fatal("delivery recovery migration missing", deliveryTable, leaseColumn, err)
	}
}
