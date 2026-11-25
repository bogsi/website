-- Orders from the roussev.dev inquiry form. Columns map 1:1 to the former
-- Google Sheet: ID, Дата, Имена, Email, Компания, AWS Услуга, Описание,
-- Бюджет, Срок, Статут.
CREATE TABLE orders (
  id          TEXT PRIMARY KEY,                 -- ORD-XXXXXXX
  created_at  INTEGER NOT NULL,                 -- unix ms
  updated_at  INTEGER NOT NULL,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  aws_service TEXT NOT NULL,
  description TEXT NOT NULL,
  budget      TEXT NOT NULL DEFAULT '',         -- free text
  deadline    TEXT NOT NULL DEFAULT '',         -- free text
  status      TEXT NOT NULL DEFAULT 'new'
              CHECK (status IN ('new','contacted','quoted','won','lost','in_progress','done')),
  notes       TEXT NOT NULL DEFAULT '',         -- internal, never emailed
  source      TEXT NOT NULL DEFAULT 'form'
              CHECK (source IN ('form','import'))
);

CREATE INDEX idx_orders_created ON orders (created_at DESC);
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);

-- Append-only history: status changes, notes, client emails.
CREATE TABLE order_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at          INTEGER NOT NULL,                 -- unix ms
  actor       TEXT NOT NULL,                    -- Access email, 'form' or 'import'
  type        TEXT NOT NULL CHECK (type IN ('created','status_change','note','email_sent','email_failed')),
  from_status TEXT,
  to_status   TEXT,
  body        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_events_order ON order_events (order_id, at);
