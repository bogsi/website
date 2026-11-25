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
              CHECK (source IN ('form','import')),
  -- Delivery state of this order's emails, derived from email_outbox:
  -- pending (queued or retrying), sent (all delivered), failed (gave up).
  notify_status TEXT NOT NULL DEFAULT 'pending'
              CHECK (notify_status IN ('pending','sent','failed'))
);

CREATE INDEX idx_orders_created ON orders (created_at DESC);
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX idx_orders_email ON orders (email);

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

-- Every outgoing email is stored first, then sent. A failed send stays
-- 'pending' and the admin Worker's hourly cron retries it, so a Resend outage
-- or the 100/day quota (resets 00:00 UTC) never loses a message.
CREATE TABLE email_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('order_client','order_admin','status_change')),
  to_addr     TEXT NOT NULL,
  reply_to    TEXT NOT NULL DEFAULT '',
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  sent_at     INTEGER
);

CREATE INDEX idx_outbox_status_created ON email_outbox (status, created_at);
CREATE INDEX idx_outbox_order ON email_outbox (order_id);
