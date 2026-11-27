import { describe, expect, it } from "vitest";
import { LAST_RUN_KEY, RETENTION_DAYS, purgeExpiredOrders } from "../src/api/retention";
import { retentionDeleteAt } from "../src/shared/orders";
import { createD1 } from "./d1-shim";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function seed(db: ReturnType<typeof createD1>, rows: [string, string, number][]) {
  const ins = db.raw.prepare(
    `INSERT INTO orders (id, created_at, updated_at, full_name, email, company, aws_service, description, status)
     VALUES (?, ?, ?, 'N', 'n@ex.com', '', 'S', 'd', ?)`,
  );
  const ev = db.raw.prepare("INSERT INTO order_events (order_id, at, actor, type, body) VALUES (?, ?, 'form', 'created', '')");
  const mail = db.raw.prepare(
    "INSERT INTO email_outbox (order_id, kind, to_addr, reply_to, subject, html, status, attempts, created_at) VALUES (?, 'order_client', 'n@ex.com', '', 's', 'h', 'sent', 1, ?)",
  );
  for (const [id, status, age] of rows) {
    const at = NOW - age * DAY;
    ins.run(id, at, at, status);
    ev.run(id, at);
    mail.run(id, at);
  }
}

describe("retention", () => {
  it("deletes only closed orders past the period, with their events and emails", async () => {
    const db = createD1();
    seed(db, [
      ["ORD-DONEOLD", "done", RETENTION_DAYS + 1],
      ["ORD-LOSTOLD", "lost", RETENTION_DAYS + 30],
      ["ORD-DONENEW", "done", RETENTION_DAYS - 1],
      ["ORD-WONOLD0", "won", RETENTION_DAYS + 400],
      ["ORD-NEWOLD0", "new", RETENTION_DAYS + 400],
    ]);
    expect(await purgeExpiredOrders(db, NOW)).toBe(2);
    const ids = (db.raw.prepare("SELECT id FROM orders ORDER BY id").all() as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual(["ORD-DONENEW", "ORD-NEWOLD0", "ORD-WONOLD0"]);
    for (const table of ["order_events", "email_outbox"]) {
      const left = db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE order_id IN ('ORD-DONEOLD', 'ORD-LOSTOLD')`).get();
      expect(left).toEqual({ n: 0 });
    }
    expect(await purgeExpiredOrders(db, NOW)).toBe(0);
  });

  it("records when it ran, also when nothing was deleted", async () => {
    const db = createD1();
    await purgeExpiredOrders(db, NOW);
    await purgeExpiredOrders(db, NOW + DAY);
    expect(db.raw.prepare("SELECT value FROM app_meta WHERE key = ?").get(LAST_RUN_KEY)).toEqual({ value: String(NOW + DAY) });
  });

  it("gives the deletion date only for closed orders, matching the cleanup cutoff", () => {
    expect(retentionDeleteAt({ status: "done", updated_at: NOW })).toBe(NOW + RETENTION_DAYS * DAY);
    expect(retentionDeleteAt({ status: "lost", updated_at: NOW })).toBe(NOW + RETENTION_DAYS * DAY);
    expect(retentionDeleteAt({ status: "won", updated_at: NOW })).toBeNull();
  });
});
