import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { app } from "../src/api/index";
import { createD1 } from "./d1-shim";

const TEAM = "https://team.cloudflareaccess.com";
const AUD = "aud-123";
const ORIGIN = "https://admin.roussev.dev";

let db: ReturnType<typeof createD1>;
let pending: Promise<unknown>[];
let fetchMock: ReturnType<typeof vi.fn>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: Record<string, unknown>;

const env = () => ({
  DB: db,
  ASSETS: {} as Fetcher,
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  RESEND_API_KEY: "re_test",
  FROM_EMAIL: "orders@roussev.dev",
  ADMIN_EMAIL: "admin@roussev.dev",
});
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} }) as unknown as ExecutionContext;

async function token(overrides: { aud?: string; iss?: string; email?: string } = {}) {
  return new SignJWT({ email: overrides.email ?? "bogomil@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(overrides.iss ?? TEAM)
    .setAudience(overrides.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
}

async function call(path: string, init: RequestInit & { auth?: string | null; origin?: string } = {}, e = env()) {
  const headers = new Headers(init.headers);
  const t = init.auth === undefined ? await token() : init.auth;
  if (t) headers.set("Cf-Access-Jwt-Assertion", t);
  if (init.method && init.method !== "GET") headers.set("Origin", init.origin ?? ORIGIN);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await app.request(`${ORIGIN}${path}`, { ...init, headers }, e, ctx());
  await Promise.all(pending);
  return res;
}

function seed(n: number, base = 1_700_000_000_000) {
  const ins = db.raw.prepare(
    `INSERT INTO orders (id, created_at, updated_at, full_name, email, company, aws_service, description, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Terraform Automation', 'desc', ?)`,
  );
  for (let i = 0; i < n; i++) {
    const id = `ORD-${String(i).padStart(7, "0")}`;
    ins.run(id, base + i * 1000, base + i * 1000, `Client ${i}`, `c${i}@ex.com`, i % 2 ? "Acme_100%" : "Other", i % 3 ? "new" : "quoted");
  }
}

// One signing key for the whole file: the API caches the JWKS per isolate,
// exactly as it does in production.
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
});

beforeEach(async () => {
  db = createD1();
  pending = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    if (url.startsWith("https://api.resend.com/")) return Response.json({ id: "email_1" });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Access", () => {
  it("refuses requests without a token", async () => {
    expect((await call("/api/me", { auth: null })).status).toBe(401);
  });
  it("accepts a valid Access JWT and exposes the email", async () => {
    const res = await call("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "bogomil@example.com" });
  });
  it("rejects a wrong audience or issuer", async () => {
    expect((await call("/api/me", { auth: await token({ aud: "other" }) })).status).toBe(401);
    expect((await call("/api/me", { auth: await token({ iss: "https://evil.cloudflareaccess.com" }) })).status).toBe(401);
  });
  it("rejects a token signed by another key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "x@y.z" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(TEAM).setAudience(AUD).setExpirationTime("5m").sign(other.privateKey);
    expect((await call("/api/me", { auth: forged })).status).toBe(401);
  });
  it("fails closed when Access is not configured", async () => {
    expect((await call("/api/me", {}, { ...env(), ACCESS_AUD: "" })).status).toBe(503);
  });
  it("honours ACCESS_DEV_EMAIL only on localhost", async () => {
    const e = { ...env(), ACCESS_DEV_EMAIL: "dev@local" };
    const local = await app.request("http://localhost:8787/api/me", {}, e, ctx());
    expect(await local.json()).toEqual({ email: "dev@local" });
    const remote = await app.request(`${ORIGIN}/api/me`, {}, e, ctx());
    expect(remote.status).toBe(401);
  });
  it("refuses cross-origin writes", async () => {
    seed(1);
    const res = await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ notes: "x" }), origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("orders list", () => {
  it("pages newest first with a cursor and no duplicates", async () => {
    seed(120);
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await call(`/api/orders${cursor ? `?cursor=${cursor}` : ""}`);
      const body = (await res.json()) as { items: { id: string }[]; nextCursor: string | null };
      ids.push(...body.items.map((o) => o.id));
      cursor = body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(ids.length).toBe(120);
    expect(new Set(ids).size).toBe(120);
    expect(ids[0]).toBe("ORD-0000119");
  });
  it("filters by status and searches with LIKE wildcards escaped", async () => {
    seed(10);
    const quoted = (await (await call("/api/orders?status=quoted")).json()) as { items: { status: string }[] };
    expect(quoted.items.length).toBe(4);
    expect(quoted.items.every((o) => o.status === "quoted")).toBe(true);
    const pct = (await (await call(`/api/orders?q=${encodeURIComponent("_100%")}`)).json()) as { items: unknown[] };
    expect(pct.items.length).toBe(5);
    const none = (await (await call(`/api/orders?q=${encodeURIComponent("%")}`)).json()) as { items: unknown[] };
    expect(none.items.length).toBe(5); // only companies that literally contain "%"
  });
  it("rejects an unknown status", async () => {
    expect((await call("/api/orders?status=bogus")).status).toBe(400);
  });
});

describe("order updates", () => {
  beforeEach(() => seed(1));

  it("changes status, logs the change and emails the client", async () => {
    const res = await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ status: "contacted" }) });
    expect(res.status).toBe(200);
    const detail = (await (await call("/api/orders/ORD-0000000")).json()) as { order: { status: string }; events: { type: string; actor: string }[] };
    expect(detail.order.status).toBe("contacted");
    expect(detail.events.map((e) => e.type).sort()).toEqual(["email_sent", "status_change"]);
    expect(detail.events.find((e) => e.type === "status_change")!.actor).toBe("bogomil@example.com");
    const mail = fetchMock.mock.calls.find(([u]) => String(u).includes("resend"))!;
    const payload = JSON.parse((mail[1] as RequestInit).body as string);
    expect(payload.to).toBe("c0@ex.com");
    expect(payload.reply_to).toBe("admin@roussev.dev");
    expect(payload.subject).toContain("ORD-0000000");
  });

  it("records a failed email without failing the update", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/certs")) return Response.json({ keys: [jwk] });
      return new Response("quota", { status: 429 });
    });
    const res = await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ status: "won" }) });
    expect(res.status).toBe(200);
    const types = db.raw.prepare("SELECT type, body FROM order_events").all() as { type: string; body: string }[];
    expect(types.find((t) => t.type === "email_failed")!.body).toContain("429");
  });

  it("does not email when only notes change or the status is unchanged", async () => {
    await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ notes: "call Tue" }) });
    await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ status: "quoted" }) }); // seed(1) is already "quoted"
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("resend"))).toBe(false);
    const row = db.raw.prepare("SELECT notes FROM orders").get() as { notes: string };
    expect(row.notes).toBe("call Tue");
  });

  it("escapes client data in the status email", async () => {
    db.raw.prepare("UPDATE orders SET full_name = '<img src=x onerror=alert(1)>'").run();
    await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ status: "done" }) });
    const mail = fetchMock.mock.calls.find(([u]) => String(u).includes("resend"))!;
    const html = JSON.parse((mail[1] as RequestInit).body as string).html as string;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("validates bodies and unknown orders", async () => {
    expect((await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ status: "nope" }) })).status).toBe(400);
    expect((await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({}) })).status).toBe(400);
    expect((await call("/api/orders/ORD-XXXXXXX", { method: "PATCH", body: JSON.stringify({ notes: "a" }) })).status).toBe(404);
    expect((await call("/api/orders/ORD-XXXXXXX")).status).toBe(404);
  });

  it("adds timeline notes", async () => {
    const res = await call("/api/orders/ORD-0000000/notes", { method: "POST", body: JSON.stringify({ body: "Asked for VPC diagram" }) });
    expect(res.status).toBe(201);
    const ev = db.raw.prepare("SELECT type, body, actor FROM order_events").get() as Record<string, string>;
    expect(ev).toEqual({ type: "note", body: "Asked for VPC diagram", actor: "bogomil@example.com" });
  });
});

describe("stats", () => {
  it("counts by status, by month and the last 7 days", async () => {
    seed(6);
    db.raw.prepare("UPDATE orders SET created_at = ? WHERE id = 'ORD-0000005'").run(Date.now());
    const s = (await (await call("/api/stats")).json()) as { byStatus: { status: string; count: number }[]; byMonth: unknown[]; newLast7Days: number };
    expect(Object.fromEntries(s.byStatus.map((r) => [r.status, r.count]))).toEqual({ new: 4, quoted: 2 });
    expect(s.newLast7Days).toBe(1);
    expect(s.byMonth.length).toBe(2);
  });
});

describe("account", () => {
  it("shows the signed-in user, session expiry, notification addresses and outbox health", async () => {
    seed(1);
    db.raw.prepare(
      `INSERT INTO email_outbox (order_id, kind, to_addr, subject, html, status, created_at) VALUES
       ('ORD-0000000','status_change','a@x','s','h','pending',1), ('ORD-0000000','status_change','a@x','s','h','failed',2)`,
    ).run();
    const a = (await (await call("/api/account")).json()) as Record<string, unknown>;
    expect(a).toMatchObject({
      email: "bogomil@example.com",
      notifications: { adminEmail: "admin@roussev.dev", fromEmail: "orders@roussev.dev" },
      outbox: { pending: 1, failed: 1 },
    });
    expect(a.sessionExpiresAt).toBeGreaterThan(Date.now());
  });

  it("shows the retention period and when the cleanup last ran", async () => {
    const before = (await (await call("/api/account")).json()) as { retention: unknown };
    expect(before.retention).toEqual({ days: 730, lastRunAt: null });
    const { purgeExpiredOrders } = await import("../src/api/retention");
    await purgeExpiredOrders(db, 1_800_000_000_000);
    const after = (await (await call("/api/account")).json()) as { retention: unknown };
    expect(after.retention).toEqual({ days: 730, lastRunAt: 1_800_000_000_000 });
  });

  it("retries pending and given-up emails on demand", async () => {
    seed(1);
    db.raw.prepare(
      `INSERT INTO email_outbox (order_id, kind, to_addr, subject, html, status, attempts, created_at)
       VALUES ('ORD-0000000','status_change','a@x','s','h','failed',5,1)`,
    ).run();
    const res = await call("/api/outbox/retry", { method: "POST" });
    expect(await res.json()).toEqual({ sent: 1, failed: 0 });
    expect(db.raw.prepare("SELECT status, attempts FROM email_outbox").get()).toEqual({ status: "sent", attempts: 1 });
  });

  it("refuses the retry without Access or from another origin", async () => {
    expect((await call("/api/outbox/retry", { method: "POST", auth: null })).status).toBe(401);
    expect((await call("/api/outbox/retry", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
  });
});

describe("security headers", () => {
  it("are set on success, auth failures and 404s", async () => {
    for (const res of [await call("/api/me"), await call("/api/me", { auth: null }), await call("/api/nope")]) {
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    }
  });
});

describe("order deletion", () => {
  beforeEach(() => seed(2));

  it("removes the order, its events and its emails, and nothing else", async () => {
    await call("/api/orders/ORD-0000000", { method: "PATCH", body: JSON.stringify({ status: "contacted" }) });
    const res = await call("/api/orders/ORD-0000000", { method: "DELETE", body: JSON.stringify({ confirm: "ORD-0000000" }) });
    expect(res.status).toBe(200);
    const count = (table: string, col: string) =>
      (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = 'ORD-0000000'`).get() as { n: number }).n;
    expect([count("orders", "id"), count("order_events", "order_id"), count("email_outbox", "order_id")]).toEqual([0, 0, 0]);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 1 });
    expect((await call("/api/orders/ORD-0000000")).status).toBe(404);
  });

  it("needs the order id as confirmation, Access and a same-origin request", async () => {
    expect((await call("/api/orders/ORD-0000000", { method: "DELETE", body: JSON.stringify({ confirm: "ORD-0000001" }) })).status).toBe(400);
    expect((await call("/api/orders/ORD-0000000", { method: "DELETE", body: "{}" })).status).toBe(400);
    expect((await call("/api/orders/ORD-0000000", { method: "DELETE", auth: null, body: JSON.stringify({ confirm: "ORD-0000000" }) })).status).toBe(401);
    expect((await call("/api/orders/ORD-0000000", { method: "DELETE", origin: "https://evil.example", body: JSON.stringify({ confirm: "ORD-0000000" }) })).status).toBe(403);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 2 });
  });

  it("returns 404 for an unknown order", async () => {
    expect((await call("/api/orders/ORD-NOPE000", { method: "DELETE", body: JSON.stringify({ confirm: "ORD-NOPE000" }) })).status).toBe(404);
  });
});

describe("CSV export", () => {
  it("exports the current filter as CSV with safe cells and no caching", async () => {
    seed(4);
    db.raw.prepare("UPDATE orders SET description = ?, full_name = ? WHERE id = 'ORD-0000001'").run(
      '=HYPERLINK("http://evil.example","click")',
      'Doe, "Jane"',
    );
    const res = await call("/api/orders.csv?status=new");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("id,created_at,")).toBe(true);
    const lines = text.trim().split("\r\n");
    // seed(4): ids 0..3, status "quoted" when i % 3 === 0, so 1 and 2 are "new".
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^ORD-0000002,/);
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(text).toContain(`"Doe, ""Jane"""`);
  });

  it("neutralises every formula prefix", async () => {
    const { csvCell } = await import("../src/api/orders");
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
      expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("plain")).toBe("plain");
  });

  it("needs Access and rejects a bad filter", async () => {
    expect((await call("/api/orders.csv", { auth: null })).status).toBe(401);
    expect((await call("/api/orders.csv?status=nope")).status).toBe(400);
  });
});

describe("status email preview and resend", () => {
  const insertEmail = (status: string, orderId = "ORD-0000000") =>
    Number(
      db.raw
        .prepare(
          `INSERT INTO email_outbox (order_id, kind, to_addr, subject, html, status, attempts, last_error, created_at)
           VALUES (?, 'status_change', 'c0@ex.com', 'Update', '<p>h</p>', ?, 5, 'Resend 429: quota', 1)`,
        )
        .run(orderId, status).lastInsertRowid,
    );

  it("previews the email for a status without changing anything", async () => {
    seed(1);
    db.raw.prepare("UPDATE orders SET full_name = '<b>Eve</b>' WHERE id = 'ORD-0000000'").run();
    const res = await call("/api/orders/ORD-0000000/status-email?status=won");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { to: string; subject: string; html: string };
    expect(body.to).toBe("c0@ex.com");
    expect(body.subject).toContain("ORD-0000000");
    expect(body.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(db.raw.prepare("SELECT status FROM orders").get()).toEqual({ status: "quoted" });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM email_outbox").get()).toEqual({ n: 0 });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("resend.com"))).toBe(false);
    expect((await call("/api/orders/ORD-0000000/status-email?status=nope")).status).toBe(400);
    expect((await call("/api/orders/ORD-MISSING/status-email?status=won")).status).toBe(404);
  });

  it("lists the order's emails without their HTML", async () => {
    seed(1);
    insertEmail("failed");
    const body = (await (await call("/api/orders/ORD-0000000")).json()) as { emails: Record<string, unknown>[] };
    expect(body.emails).toHaveLength(1);
    expect(body.emails[0]).toMatchObject({ status: "failed", attempts: 5, last_error: "Resend 429: quota" });
    expect(body.emails[0]).not.toHaveProperty("html");
  });

  it("resends a failed email once and records the outcome", async () => {
    seed(1);
    const emailId = insertEmail("failed");
    const res = await call(`/api/orders/ORD-0000000/emails/${emailId}/resend`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; email: { status: string; attempts: number } };
    expect(body.sent).toBe(1);
    expect(body.email).toMatchObject({ status: "sent", attempts: 1 });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("resend.com"))).toHaveLength(1);
  });

  it("refuses emails that did not fail, belong to another order, or come cross-origin", async () => {
    seed(2);
    const sent = insertEmail("sent");
    const other = insertEmail("failed", "ORD-0000001");
    expect((await call(`/api/orders/ORD-0000000/emails/${sent}/resend`, { method: "POST" })).status).toBe(409);
    expect((await call(`/api/orders/ORD-0000000/emails/${other}/resend`, { method: "POST" })).status).toBe(404);
    expect((await call(`/api/orders/ORD-0000000/emails/abc/resend`, { method: "POST" })).status).toBe(404);
    expect(
      (await call(`/api/orders/ORD-0000001/emails/${other}/resend`, { method: "POST", origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("resend.com"))).toBe(false);
  });
});
