-- Keep JSON strings and property ordering for existing source and score hashes.
-- Better Auth manages its own authentication tables separately.
CREATE TABLE IF NOT EXISTS records (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS records_tenant_updated_idx ON records (tenant_id, updated DESC);
