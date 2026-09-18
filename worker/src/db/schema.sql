CREATE TABLE parcels (
  id TEXT PRIMARY KEY,
  pickup_code_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('text', 'markdown', 'file')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT,                    -- 文本/Markdown 内容直接存 D1
  file_key TEXT,                   -- R2 中的 object key
  file_size INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT '',
  expires_at TEXT NOT NULL,        -- ISO 8601
  max_downloads INTEGER NOT NULL DEFAULT 0,  -- 0 = 无限
  download_count INTEGER NOT NULL DEFAULT 0,
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','CLAIMED','CONSUMED','DELETED')),
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hash TEXT                     -- 创建者 IP hash，用于限速
);
CREATE INDEX idx_parcels_expires ON parcels(expires_at);
CREATE INDEX idx_parcels_status ON parcels(status);
