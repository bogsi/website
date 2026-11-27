-- Small key/value table for operational facts the dashboard shows, such as
-- when the daily retention cleanup last ran (key 'retention_last_run', epoch ms).
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
