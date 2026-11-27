// Data retention (task T31): closed orders are kept for 24 months after
// their last change, then deleted with their timeline and emails. Open
// orders are never touched. The same period is stated on the privacy page.

import { CLOSED_STATUSES, RETENTION_DAYS } from "../shared/orders";

export { CLOSED_STATUSES, RETENTION_DAYS };
export const LAST_RUN_KEY = "retention_last_run";
/** UTC hour at which the hourly cron also runs the daily cleanup. */
export const CLEANUP_HOUR_UTC = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes closed orders older than the retention period and records when it
 * ran (shown on the Account page); returns how many orders were deleted.
 */
export async function purgeExpiredOrders(db: D1Database, now = Date.now()): Promise<number> {
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  const expired = `SELECT id FROM orders WHERE status IN ('done', 'lost') AND updated_at < ?`;
  const results = await db.batch([
    db.prepare(`DELETE FROM email_outbox WHERE order_id IN (${expired})`).bind(cutoff),
    db.prepare(`DELETE FROM order_events WHERE order_id IN (${expired})`).bind(cutoff),
    db.prepare(`DELETE FROM orders WHERE status IN ('done', 'lost') AND updated_at < ?`).bind(cutoff),
    db
      .prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(LAST_RUN_KEY, String(now)),
  ]);
  return results[2]?.meta.changes ?? 0;
}
