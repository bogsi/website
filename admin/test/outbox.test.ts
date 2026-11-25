import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTEMPTS, deliver, enqueueStatement, processPending } from "../../lib/outbox.js";
import worker from "../src/api/index";
import { createD1 } from "./d1-shim";

const env = { RESEND_API_KEY: "re", FROM_EMAIL: "orders@roussev.dev" };
let db: ReturnType<typeof createD1>;
let resendStatus: number;
let sentTo: string[];

beforeEach(() => {
  db = createD1();
  db.raw
    .prepare(
      `INSERT INTO orders (id, created_at, updated_at, full_name, email, aws_service, description)
       VALUES ('ORD-AAAAAAA', 1, 1, 'Jane', 'jane@ex.com', 'Terraform Automation', 'd')`,
    )
    .run();
  resendStatus = 200;
  sentTo = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    sentTo.push(JSON.parse(init!.body as string).to);
    return resendStatus === 200 ? Response.json({ id: "x" }) : new Response("quota", { status: resendStatus });
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function queue(n: number) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await enqueueStatement(db, {
      orderId: "ORD-AAAAAAA", kind: "status_change", to: `c${i}@ex.com`, subject: `S${i}`, html: "<p>x</p>", now: 1000 + i,
    }).all<{ id: number }>();
    ids.push(res.results[0]!.id);
  }
  return ids;
}
const outbox = () => db.raw.prepare("SELECT status, attempts, last_error FROM email_outbox ORDER BY id").all() as { status: string; attempts: number; last_error: string }[];
const notify = () => (db.raw.prepare("SELECT notify_status FROM orders").get() as { notify_status: string }).notify_status;

describe("outbox", () => {
  it("sends, records the event and marks the order sent", async () => {
    const ids = await queue(1);
    expect(await deliver(db, env, ids)).toEqual({ sent: 1, failed: 0 });
    expect(outbox()[0]).toMatchObject({ status: "sent", attempts: 1 });
    expect(notify()).toBe("sent");
    expect(db.raw.prepare("SELECT type FROM order_events").all()).toEqual([{ type: "email_sent" }]);
  });

  it("keeps a failed email pending, then the retry sends it", async () => {
    const ids = await queue(1);
    resendStatus = 429;
    await deliver(db, env, ids);
    expect(outbox()[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(outbox()[0]!.last_error).toContain("429");
    expect(notify()).toBe("pending");

    resendStatus = 200;
    expect(await processPending(db, env)).toEqual({ sent: 1, failed: 0 });
    expect(outbox()[0]).toMatchObject({ status: "sent", attempts: 2, last_error: "" });
    expect(notify()).toBe("sent");
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts and marks the order failed`, async () => {
    await queue(1);
    resendStatus = 500;
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await processPending(db, env);
    expect(outbox()[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(notify()).toBe("failed");
    expect(sentTo.length).toBe(MAX_ATTEMPTS); // no attempts after giving up
  });

  it("does not resend an email that was already sent", async () => {
    const ids = await queue(1);
    await deliver(db, env, ids);
    await deliver(db, env, ids);
    await processPending(db, env);
    expect(sentTo.length).toBe(1);
  });

  it("retries oldest first and respects the per-run limit", async () => {
    await queue(20);
    resendStatus = 200;
    expect(await processPending(db, env)).toEqual({ sent: 15, failed: 0 });
    expect(sentTo.slice(0, 3)).toEqual(["c0@ex.com", "c1@ex.com", "c2@ex.com"]);
    expect(await processPending(db, env)).toEqual({ sent: 5, failed: 0 });
  });

  it("fails cleanly without Resend configuration", async () => {
    const ids = await queue(1);
    expect(await deliver(db, {}, ids)).toEqual({ sent: 0, failed: 1 });
    expect(outbox()[0]!.last_error).toContain("RESEND_API_KEY");
  });

  it("is run by the Worker's scheduled handler", async () => {
    await queue(2);
    const pending: Promise<unknown>[] = [];
    await worker.scheduled!(
      {} as ScheduledController,
      { ...env, DB: db } as never,
      { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext,
    );
    await Promise.all(pending);
    expect(outbox().map((r) => r.status)).toEqual(["sent", "sent"]);
  });
});
