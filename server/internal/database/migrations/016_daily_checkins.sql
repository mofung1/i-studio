CREATE TABLE daily_checkins (
 user_id TEXT NOT NULL REFERENCES users(id),
 claim_day DATE NOT NULL,
 reward_minor BIGINT NOT NULL CHECK(reward_minor > 0 AND reward_minor <= 100000000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, claim_day)
);
CREATE INDEX daily_checkins_day ON daily_checkins(claim_day);
