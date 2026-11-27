// Email outbox shared by the order form (functions/api/order.js) and the admin
// Worker (admin/src/api). Plain JS so both bundlers can import it as is.
//
// Flow: a caller INSERTs rows with enqueueStatement() in the same D1 batch as
// the change that caused them, then calls deliver() for those ids, usually in
// waitUntil(). A failed send stays 'pending' and processPending() (hourly cron
// in the admin Worker) retries it until MAX_ATTEMPTS, then marks it 'failed'.

import { redact } from "./redact.js";

export const MAX_ATTEMPTS = 5;

/**
 * @param {D1Database} db
 * @param {{ orderId: string, kind: 'order_client'|'order_admin'|'status_change', to: string, replyTo?: string, subject: string, html: string, now: number }} m
 */
export function enqueueStatement(db, m) {
  return db
    .prepare(
      `INSERT INTO email_outbox (order_id, kind, to_addr, reply_to, subject, html, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(m.orderId, m.kind, m.to, m.replyTo ?? "", m.subject, m.html, m.now);
}

/** Sends one email through Resend; throws with Resend's answer on failure. */
async function send(env, row) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    throw new Error("RESEND_API_KEY or FROM_EMAIL is not set");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: row.to_addr,
      ...(row.reply_to ? { reply_to: row.reply_to } : {}),
      subject: row.subject,
      html: row.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

const NOTIFY_STATUS_SQL = `
  UPDATE orders SET notify_status = CASE
    WHEN EXISTS (SELECT 1 FROM email_outbox o WHERE o.order_id = orders.id AND o.status = 'pending') THEN 'pending'
    WHEN EXISTS (SELECT 1 FROM email_outbox o WHERE o.order_id = orders.id AND o.status = 'failed') THEN 'failed'
    ELSE 'sent' END
  WHERE id = ?`;

/**
 * Attempts the given outbox rows once and records the outcome: the row's
 * status, an order_events entry, and the order's notify_status.
 * Never throws; returns counts for logging and tests.
 *
 * @param {D1Database} db
 * @param {Record<string, string | undefined>} env
 * @param {number[]} ids
 */
export async function deliver(db, env, ids) {
  if (ids.length === 0) return { sent: 0, failed: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const { results: rows } = await db
    .prepare(`SELECT * FROM email_outbox WHERE id IN (${placeholders}) AND status = 'pending'`)
    .bind(...ids)
    .all();

  const now = Date.now();
  const stmts = [];
  const orders = new Set();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    orders.add(row.order_id);
    const attempts = row.attempts + 1;
    try {
      await send(env, row);
      sent++;
      stmts.push(
        db.prepare("UPDATE email_outbox SET status = 'sent', attempts = ?, sent_at = ?, last_error = '' WHERE id = ?")
          .bind(attempts, now, row.id),
        db.prepare("INSERT INTO order_events (order_id, at, actor, type, body) VALUES (?, ?, 'system', 'email_sent', ?)")
          .bind(row.order_id, now, `Email "${row.subject}" sent to ${row.to_addr}`),
      );
    } catch (err) {
      failed++;
      const message = String(err && err.message ? err.message : err).slice(0, 500);
      const giveUp = attempts >= MAX_ATTEMPTS;
      console.error(`Outbox ${row.id} (${row.order_id}) attempt ${attempts} failed: ${redact(message)}`);
      stmts.push(
        db.prepare("UPDATE email_outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?")
          .bind(giveUp ? "failed" : "pending", attempts, message, row.id),
        db.prepare("INSERT INTO order_events (order_id, at, actor, type, body) VALUES (?, ?, 'system', 'email_failed', ?)")
          .bind(
            row.order_id,
            now,
            `Email "${row.subject}" to ${row.to_addr} failed (attempt ${attempts}/${MAX_ATTEMPTS}${giveUp ? ", giving up" : ", will retry"}): ${message}`,
          ),
      );
    }
  }
  for (const orderId of orders) stmts.push(db.prepare(NOTIFY_STATUS_SQL).bind(orderId));
  if (stmts.length) await db.batch(stmts);
  return { sent, failed };
}

/**
 * Retries pending emails, oldest first. The limit keeps one cron run inside
 * the Free plan's 50 subrequests and 50 D1 queries per invocation.
 *
 * @param {D1Database} db
 * @param {Record<string, string | undefined>} env
 * @param {number} [limit]
 */
export async function processPending(db, env, limit = 15) {
  const { results } = await db
    .prepare("SELECT id FROM email_outbox WHERE status = 'pending' ORDER BY created_at LIMIT ?")
    .bind(limit)
    .all();
  return deliver(db, env, results.map((r) => r.id));
}
