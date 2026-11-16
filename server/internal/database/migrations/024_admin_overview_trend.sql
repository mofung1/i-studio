CREATE INDEX IF NOT EXISTS generation_tasks_overview_time ON generation_tasks(created_at);
CREATE INDEX IF NOT EXISTS credit_ledger_settlement_time ON credit_ledger(created_at) WHERE kind = 'settlement';
