import { Hono } from "hono";
import { z } from "zod";
import { STATUSES, type Order, type OrderEvent, type Status } from "../shared/orders";
import { sendStatusEmail } from "./email";
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

const noteBody = z.object({ body: z.string().trim().min(1).max(5_000) });

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

export const orders = new Hono<AppEnv>()
  .get("/orders", async (c) => {
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "Invalid query" }, 400);
    const { status, q, cursor } = parsed.data;

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

  .get("/orders/:id", async (c) => {
    const id = c.req.param("id");
    const [order, events] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id),
      c.env.DB.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY at DESC, id DESC").bind(id),
    ]);
    const row = order!.results[0] as Order | undefined;
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ order: row, events: events!.results as OrderEvent[] });
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
      stmts.push(
        db
          .prepare(
            "INSERT INTO order_events (order_id, at, actor, type, from_status, to_status) VALUES (?, ?, ?, 'status_change', ?, ?)",
          )
          .bind(id, now, actor, current.status, next.status),
      );
    }
    await db.batch(stmts);

    // Every status change emails the client. Sent after the response; the
    // outcome is recorded in the timeline either way.
    if (statusChanged) {
      const notify = async () => {
        let type: "email_sent" | "email_failed" = "email_sent";
        let body = `Status email "${next.status}" sent to ${next.email}`;
        try {
          await sendStatusEmail(c.env, next, next.status as Status);
        } catch (err) {
          type = "email_failed";
          body = `Status email "${next.status}" failed: ${(err as Error).message}`;
          console.error(body);
        }
        await db
          .prepare("INSERT INTO order_events (order_id, at, actor, type, to_status, body) VALUES (?, ?, 'system', ?, ?, ?)")
          .bind(id, Date.now(), type, next.status, body)
          .run();
      };
      c.executionCtx.waitUntil(notify());
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
