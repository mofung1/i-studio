package database

import (
	"context"
	"database/sql"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func Open(url string) (*sql.DB, error) {
	if url == "" {
		return nil, nil
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func Status(db *sql.DB) string {
	if db == nil {
		return "not_configured"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return "unavailable"
	}
	return "ready"
}
