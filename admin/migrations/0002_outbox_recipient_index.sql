-- Speeds up the order form's anti-relay check, which counts the customer
-- confirmations sent to one address in the last 24 hours.
CREATE INDEX idx_outbox_kind_to_created ON email_outbox (kind, to_addr, created_at);
