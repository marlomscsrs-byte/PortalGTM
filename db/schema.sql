CREATE TABLE IF NOT EXISTS users(
 id BIGSERIAL PRIMARY KEY, passport_id VARCHAR(32) UNIQUE NOT NULL,
 full_name VARCHAR(120) NOT NULL, badge VARCHAR(60) NOT NULL DEFAULT '',
 rank VARCHAR(80) NOT NULL DEFAULT '', role VARCHAR(80) NOT NULL DEFAULT 'Probatório',
 status VARCHAR(20) NOT NULL DEFAULT 'Ativo' CHECK(status IN ('Ativo','Inativo','Afastado','Pendente')),
 password_hash TEXT, is_admin BOOLEAN NOT NULL DEFAULT FALSE,
 access_status VARCHAR(20) NOT NULL DEFAULT 'APROVADO' CHECK(access_status IN ('PENDENTE','APROVADO','REJEITADO')),
 requested_at TIMESTAMPTZ, approved_at TIMESTAMPTZ, approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 entry_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS access_requests(
 id BIGSERIAL PRIMARY KEY, passport_id VARCHAR(32) NOT NULL, full_name VARCHAR(120) NOT NULL,
 requested_role VARCHAR(80) NOT NULL, password_hash TEXT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','APROVADO','REJEITADO')),
 requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ,
 reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL, review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_requests_pending ON access_requests(status,requested_at);
CREATE TABLE IF NOT EXISTS clock_entries(
 id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),clock_out TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log(
 id BIGSERIAL PRIMARY KEY,actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 action VARCHAR(100) NOT NULL,target_passport_id VARCHAR(32),details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operational_records(
 id BIGSERIAL PRIMARY KEY,
 reporter_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 reporter_passport_id VARCHAR(32) NOT NULL,
 reporter_name VARCHAR(120) NOT NULL,
 record_type VARCHAR(40) NOT NULL CHECK(record_type IN ('QRU','Prisão')),
 qru VARCHAR(100) NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 description TEXT NOT NULL DEFAULT '',
 involved TEXT NOT NULL DEFAULT '',
 vehicle TEXT NOT NULL DEFAULT '',
 photo_url TEXT NOT NULL DEFAULT '',
 discord_status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
 discord_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operational_records_created ON operational_records(created_at DESC);
