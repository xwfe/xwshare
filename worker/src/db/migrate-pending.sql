-- 已有库：加上 PENDING、去掉 CONSUMED、补 upload_token_hash。
-- 新库直接跑 schema.sql，不要跑这个。

CREATE TABLE parcels_new (
  id TEXT PRIMARY KEY,
  pickup_code_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('text', 'markdown', 'file')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  file_key TEXT,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT '',
  expires_at TEXT NOT NULL,
  max_downloads INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  encrypted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('PENDING','AVAILABLE','CLAIMED','DELETED')),
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hash TEXT,
  upload_token_hash TEXT
);

INSERT INTO parcels_new (
  id, pickup_code_hash, type, title, content, file_key, file_size, mime_type,
  expires_at, max_downloads, download_count, burn_after_read, encrypted,
  status, storage_provider, created_at, ip_hash, upload_token_hash
)
SELECT
  id, pickup_code_hash, type, title, content, file_key, file_size, mime_type,
  expires_at, max_downloads, download_count, burn_after_read, encrypted,
  CASE WHEN status = 'CONSUMED' THEN 'CLAIMED' ELSE status END,
  storage_provider, created_at, ip_hash, NULL
FROM parcels;

DROP TABLE parcels;
ALTER TABLE parcels_new RENAME TO parcels;
CREATE INDEX idx_parcels_expires ON parcels(expires_at);
CREATE INDEX idx_parcels_status ON parcels(status);
CREATE INDEX idx_parcels_file_key ON parcels(file_key);
