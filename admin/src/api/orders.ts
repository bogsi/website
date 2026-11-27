import { Hono } from "hono";
import { z } from "zod";
import { STATUSES, type Order, type OrderEmail, type OrderEvent, type Status } from "../shared/orders";
import { deliver, enqueueStatement } from "../../../lib/outbox.js";
import { statusEmail } from "./email";
import type { AppEnv } from "./env";

const PAGE_SIZE = 50;

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
});

const patchBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    notes: z.string().max(10_000).optional(),
  })
  .refine((b) => b.status !== undefined || b.notes !== undefined, "Nothing to update");

const previewQuery = z.object({ status: z.enum(STATUSES) });
const EMAIL_COLUMNS = "id, kind, to_addr, subject, status, attempts, last_error, created_at, sent_at";

const noteBody = z.object({ body: z.string().trim().min(1).max(5_000) });
// Deleting is irreversible, so the client must repeat the order id.
const deleteBody = z.object({ confirm: z.string() });

// Keyset pagination cursor: "<created_at>:<id>" in base64url.
const encodeCursor = (o: Pick<Order, "created_at" | "id">) =>
  btoa(`${o.created_at}:${o.id}`).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const raw = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const sep = raw.indexOf(":");
    const createdAt = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    return sep > 0 && Number.isFinite(createdAt) && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** WHERE clause and arguments for the status filter and search box. */
function filterClause(status?: string, q?: string): { where: string[]; args: unknown[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  if (q) {
    const like = `%${likeEscape(q.toLowerCase())}%`;
    where.push(
      "(lower(full_name) LIKE ? ESCAPE '\\' OR lower(email) LIKE ? ESCAPE '\\' OR lower(company) LIKE ? ESCAPE '\\' OR lower(id) LIKE ? ESCAPE '\\')",
    );
    args.push(like, like, like, like);
  }
  return { where, args };
}

/** Most rows one export returns; far above the expected volume. */
export const CSV_MAX_ROWS = 10_000;

const CSV_COLUMNS: { header: string; value: (o: Order) => unknown }[] = [
  { header: "id", value: (o) => o.id },
  { header: "created_at", value: (o) => new Date(o.created_at).toISOString() },
  { header: "updated_at", value: (o) => new Date(o.updated_at).toISOString() },
  { header: "status", value: (o) => o.status },
  { header: "name", value: (o) => o.full_name },
  { header: "email", value: (o) => o.email },
  { header: "company", value: (o) => o.company },
  { header: "service", value: (o) => o.aws_service },
  { header: "budget", value: (o) => o.budget },
  { header: "deadline", value: (o) => o.deadline },
  { header: "description", value: (o) => o.description },
  { header: "source", value: (o) => o.source },
  { header: "email_delivery", value: (o) => o.notify_status },
];

/**
 * One CSV cell. A value that a spreadsheet would read as a formula (it starts
 * with =, +, -, @, tab or CR) gets a leading apostrophe, so it is shown as text.
 */
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ordersCsv(rows: Order[]): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(",")];
  for (const o of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(c.value(o))).join(","));
  // BOM so Excel opens UTF-8 names correctly; CRLF as RFC 4180 asks.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export const orders = new Hono<AppEnv>()
  .get("/orders", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "Invalid query" }, 400);
    const { status, q, cursor } = parsed.data;

    const { where, args } = filterClause(status, q);
    if (cursor) {
      const k = decodeCursor(cursor);
      if (!k) return c.json({ error: "Invalid cursor" }, 400);
      where.push("(created_at < ? OR (created_at = ? AND id < ?))");
      args.push(k.createdAt, k.createdAt, k.id);
    }

    const sql = `SELECT * FROM orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE + 1}`;
    const { results } = await c.env.DB.prepare(sql).bind(...args).all<Order>();
    const hasMore = results.length > PAGE_SIZE;
    const items = hasMore ? results.slice(0, PAGE_SIZE) : results;
    return c.json({ items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null });
  })

  // CSV of every order matching the current filter (no paging). Same Access
  // check as the rest of the API; never cached (securityHeaders).
  .get("/orders.csv", async (c) => {
    const parsed = listQuery.omit({ cursor: true }).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "Invalid query" }, 400);
    const { where, args } = filterClause(parsed.data.status, parsed.data.q);
    const sql = `SELECT * FROM orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY created_at DESC, id DESC LIMIT ${CSV_MAX_ROWS}`;
    const { results } = await c.env.DB.prepare(sql).bind(...args).all<Order>();
    const date = new Date().toISOString().slice(0, 10);
    return c.body(ordersCsv(results), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${date}.csv"`,
    });
  })

  .get("/orders/:id", async (c) => {
    const id = c.req.param("id");
    const [order, events, emails] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id),
      c.env.DB.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY at DESC, id DESC").bind(id),
      c.env.DB.prepare(`SELECT ${EMAIL_COLUMNS} FROM email_outbox WHERE order_id = ? ORDER BY created_at DESC, id DESC`).bind(id),
    ]);
    const row = order!.results[0] as Order | undefined;
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ order: row, events: events!.results as OrderEvent[], emails: emails!.results as OrderEmail[] });
  })

  // The email a status change would send, without changing anything, so the
  // dashboard can show it before saving.
  .get("/orders/:id/status-email", async (c) => {
    const parsed = previewQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "Invalid status" }, 400);
    const order = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(c.req.param("id")).first<Order>();
    if (!order) return c.json({ error: "Not found" }, 404);
    const mail = statusEmail({ ...order, status: parsed.data.status }, parsed.data.status);
    return c.json({ to: order.email, subject: mail.subject, html: mail.html });
  })

  // Sends one email of this order again, only if it gave up ("failed"): the
  // row gets a fresh set of attempts and one is made right away.
  .post("/orders/:id/emails/:emailId/resend", async (c) => {
    const id = c.req.param("id");
    const emailId = Number(c.req.param("emailId"));
    if (!Number.isInteger(emailId) || emailId <= 0) return c.json({ error: "Not found" }, 404);
    const db = c.env.DB;
    const row = await db
      .prepare("SELECT status FROM email_outbox WHERE id = ? AND order_id = ?")
      .bind(emailId, id)
      .first<{ status: OrderEmail["status"] }>();
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.status !== "failed") return c.json({ error: "Only failed emails can be resent" }, 409);
    await db.prepare("UPDATE email_outbox SET status = 'pending', attempts = 0 WHERE id = ?").bind(emailId).run();
    const result = await deliver(db, c.env, [emailId]);
    const email = await db.prepare(`SELECT ${EMAIL_COLUMNS} FROM email_outbox WHERE id = ?`).bind(emailId).first<OrderEmail>();
    return c.json({ ...result, email });
  })

  .patch("/orders/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = patchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
    const { status, notes } = parsed.data;

    const db = c.env.DB;
    const current = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Order>();
    if (!current) return c.json({ error: "Not found" }, 404);

    const now = Date.now();
    const actor = c.get("userEmail");
    const statusChanged = status !== undefined && status !== current.status;
    const next: Order = {
      ...current,
      status: status ?? current.status,
      notes: notes ?? current.notes,
      updated_at: now,
    };

    const stmts = [
      db.prepare("UPDATE orders SET status = ?, notes = ?, updated_at = ? WHERE id = ?").bind(
        next.status,
        next.notes,
        now,
        id,
      ),
    ];
    if (statusChanged) {
      // Every status change emails the client. The email is queued in the
      // outbox in the same batch, so it is retried if the first send fails.
      const mail = statusEmail(next, next.status);
      stmts.push(
        db
          .prepare(
            "INSERT INTO order_events (order_id, at, actor, type, from_status, to_status) VALUES (?, ?, ?, 'status_change', ?, ?)",
          )
          .bind(id, now, actor, current.status, next.status),
        enqueueStatement(db, {
          orderId: id,
          kind: "status_change",
          to: next.email,
          replyTo: c.env.ADMIN_EMAIL ?? "",
          subject: mail.subject,
          html: mail.html,
          now,
        }),
      );
    }
    const results = await db.batch<{ id: number }>(stmts);

    if (statusChanged) {
      const outboxId = results[results.length - 1]!.results[0]!.id;
      c.executionCtx.waitUntil(deliver(db, c.env, [outboxId]));
    }

    return c.json({ order: next, emailQueued: statusChanged });
  })

  .post("/orders/:id/notes", async (c) => {
    const id = c.req.param("id");
    const parsed = noteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
    const exists = await c.env.DB.prepare("SELECT 1 FROM orders WHERE id = ?").bind(id).first();
    if (!exists) return c.json({ error: "Not found" }, 404);
    await c.env.DB.prepare(
      "INSERT INTO order_events (order_id, at, actor, type, body) VALUES (?, ?, ?, 'note', ?)",
    )
      .bind(id, Date.now(), c.get("userEmail"), parsed.data.body)
      .run();
    return c.json({ ok: true }, 201);
  })

  // Erasure request (GDPR art. 17): removes the order, its timeline and its
  // queued or sent emails in one batch. Only the id is logged.
  .delete("/orders/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = deleteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || parsed.data.confirm !== id) {
      return c.json({ error: "Confirm by sending the order id" }, 400);
    }
    const db = c.env.DB;
    const exists = await db.prepare("SELECT 1 FROM orders WHERE id = ?").bind(id).first();
    if (!exists) return c.json({ error: "Not found" }, 404);
    await db.batch([
      db.prepare("DELETE FROM email_outbox WHERE order_id = ?").bind(id),
      db.prepare("DELETE FROM order_events WHERE order_id = ?").bind(id),
      db.prepare("DELETE FROM orders WHERE id = ?").bind(id),
    ]);
    console.log(`Order ${id} deleted`);
    return c.json({ deleted: id });
  })

  .get("/stats", async (c) => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const [byStatus, byMonth, lastWeek] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT status, COUNT(*) AS count FROM orders GROUP BY status"),
      c.env.DB.prepare(
        `SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch') AS month, COUNT(*) AS count
         FROM orders GROUP BY month ORDER BY month DESC LIMIT 12`,
      ),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ?").bind(weekAgo),
    ]);
    return c.json({
      byStatus: byStatus!.results as { status: Status; count: number }[],
      byMonth: (byMonth!.results as { month: string; count: number }[]).reverse(),
      newLast7Days: (lastWeek!.results[0] as { count: number }).count,
    });
  });
