// The public intake lives in the Hugo site's Pages Function; tested here
// because this package has the D1 test shim.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain JS module outside this package
import { onRequestPost } from "../../functions/api/order.js";
import { createD1 } from "./d1-shim";

let pending: Promise<unknown>[];
let urls: string[];

beforeEach(() => {
  pending = [];
  urls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url.split("?")[0]!);
    if (url.includes("siteverify")) return Response.json({ success: true, action: "order", hostname: "roussev.dev" });
    if (url.includes("oauth2")) return Response.json({ access_token: "t" });
    if (url.includes("fields=sheets")) return Response.json({ sheets: [{ properties: { title: "S" } }] });
    return Response.json({});
  }));
  // The Sheets path signs a JWT; stub WebCrypto so no real key is needed.
  vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
  vi.spyOn(crypto.subtle, "sign").mockResolvedValue(new ArrayBuffer(8));
});
afterEach(() => vi.restoreAllMocks());

const body = {
  name: "Jane Smith", email: "Jane@Example.com", company: "Acme", service: "Terraform Automation",
  description: "Need help", budget: "2k", deadline: "July", website: "", "cf-turnstile-response": "tok",
};
const baseEnv = { TURNSTILE_SECRET_KEY: "s", TURNSTILE_HOSTNAMES: "roussev.dev", RESEND_API_KEY: "r", FROM_EMAIL: "f@x", ADMIN_EMAIL: "a@x" };
const sheetsEnv = { GOOGLE_SERVICE_ACCOUNT_EMAIL: "g", GOOGLE_SPREADSHEET_ID: "id", GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----" };

async function submit(env: Record<string, unknown>) {
  const request = new Request("https://roussev.dev/api/order", { method: "POST", body: JSON.stringify(body) });
  const res = await onRequestPost({ request, env, waitUntil: (p: Promise<unknown>) => pending.push(p) });
  await Promise.all(pending);
  return { status: res.status, json: await res.json() };
}

describe("intake", () => {
  it("writes the order and a created event to D1 and mirrors to the Sheet", async () => {
    const db = createD1();
    const r = await submit({ ...baseEnv, ...sheetsEnv, DB: db });
    expect(r.status).toBe(200);
    const row = db.raw.prepare("SELECT * FROM orders").get() as Record<string, unknown>;
    expect(row).toMatchObject({ id: r.json.orderId, full_name: "Jane Smith", email: "jane@example.com", aws_service: "Terraform Automation", status: "new", source: "form", budget: "2k" });
    expect(db.raw.prepare("SELECT type, actor FROM order_events ORDER BY id").all()).toEqual([
      { type: "created", actor: "form" },
      { type: "email_sent", actor: "system" },
      { type: "email_sent", actor: "system" },
    ]);
    const outbox = db.raw.prepare("SELECT kind, to_addr, reply_to, status FROM email_outbox ORDER BY id").all();
    expect(outbox).toEqual([
      { kind: "order_client", to_addr: "jane@example.com", reply_to: "a@x", status: "sent" },
      { kind: "order_admin", to_addr: "a@x", reply_to: "jane@example.com", status: "sent" },
    ]);
    expect(db.raw.prepare("SELECT notify_status FROM orders").get()).toEqual({ notify_status: "sent" });
    expect(urls.some((u) => u.includes(":append"))).toBe(true);
  });

  it("keeps the order and queues emails for retry when Resend fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("siteverify")) return Response.json({ success: true, action: "order", hostname: "roussev.dev" });
      return new Response("rate limited", { status: 429 });
    }));
    const db = createD1();
    const r = await submit({ ...baseEnv, DB: db });
    expect(r.status).toBe(200);
    expect(db.raw.prepare("SELECT status, attempts FROM email_outbox").all()).toEqual([
      { status: "pending", attempts: 1 },
      { status: "pending", attempts: 1 },
    ]);
    expect(db.raw.prepare("SELECT notify_status FROM orders").get()).toEqual({ notify_status: "pending" });
  });

  it("uses D1 only when no Sheet is configured", async () => {
    const db = createD1();
    expect((await submit({ ...baseEnv, DB: db })).status).toBe(200);
    expect(urls.some((u) => u.includes("sheets.googleapis"))).toBe(false);
  });

  it("falls back to the Sheet when D1 is not bound yet", async () => {
    const r = await submit({ ...baseEnv, ...sheetsEnv });
    expect(r.status).toBe(200);
    expect(urls.some((u) => u.includes(":append"))).toBe(true);
  });

  it("returns 500 and sends no email when D1 fails", async () => {
    const db = createD1();
    db.raw.exec("DROP TABLE order_events");
    const r = await submit({ ...baseEnv, DB: db });
    expect(r.status).toBe(500);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 0 });
    expect(urls.some((u) => u.includes("resend"))).toBe(false);
  });
});
