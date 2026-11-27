import { deliver, enqueueStatement } from "../../lib/outbox.js";
import { redact } from "../../lib/redact.js";

// Max length per field. Enforced here and mirrored as maxlength in the form.
const LIMITS = {
  name: 100,
  email: 254,
  company: 150,
  service: 120,
  description: 5000,
  budget: 100,
  deadline: 100,
};

const REQUIRED = ["name", "email", "service", "description"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "order";
const TURNSTILE_TIMEOUT_MS = 10_000;

// Anti-relay: the confirmation goes to whatever address the visitor typed in,
// so the form could be used to send mail from roussev.dev to strangers. At
// most this many confirmations go to one address in a rolling 24 hours; the
// order itself and the admin email are always kept.
const CLIENT_CONFIRMATIONS_PER_DAY = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
// The largest valid order (all fields at their limits) is about 6 KB.
const MAX_BODY_BYTES = 16 * 1024;

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "https://roussev.dev",
    "Content-Type": "application/json",
  };
  const reply = (status, payload) => new Response(JSON.stringify(payload), { status, headers });

  // Cheap checks before any work: the form only ever sends small JSON.
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return reply(415, { error: "Unsupported content type" });
  }
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return reply(413, { error: "Request too large" });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return reply(413, { error: "Request too large" });
  }

  // D1 is the only store: without the binding no order can be kept.
  if (!env.DB) {
    console.error("Order storage is not configured (no DB binding)");
    return reply(503, { error: "Order service unavailable" });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: "Invalid JSON" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply(400, { error: "Invalid request" });
  }

  // Honeypot: the "website" field is hidden from people, so only bots fill it.
  // Pretend success so the bot learns nothing; nothing is stored or emailed.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return reply(200, { success: true, orderId: generateOrderId() });
  }

  // Bot check first: without a valid Turnstile token nothing is stored and,
  // crucially, no email is sent to the address typed into the form.
  const check = await verifyTurnstile(env, body["cf-turnstile-response"], request);
  if (!check.ok) {
    return reply(check.status, { error: check.error });
  }

  const parsed = normalize(body);
  if (parsed.error) {
    return reply(400, { error: parsed.error });
  }
  const { name, email, company, service, description, budget, deadline } = parsed.value;

  const orderId = generateOrderId();
  const now = Date.now();
  const order = { orderId, now, name, email, company, service, description, budget, deadline };
  let outboxIds;
  try {
    outboxIds = await insertOrder(env.DB, env, order);
  } catch (err) {
    console.error(`Order storage error for ${orderId}: ${redact(err)}`);
    return reply(500, { error: "Failed to save order" });
  }

  // Emails run after the response is returned; a failure never loses the
  // order. They were queued in the outbox together with the order, so a
  // failed send is retried by the admin Worker's hourly cron.
  context.waitUntil(
    deliver(env.DB, env, outboxIds).catch((err) => console.error(`Email error for ${orderId}: ${redact(err)}`))
  );

  return reply(200, { success: true, orderId });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://roussev.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// The order, its "created" event and both emails, written atomically.
// The customer confirmation is queued only while its address is under the
// daily cap; otherwise a note on the order says why it was skipped. Both
// checks run inside the same batch (one transaction), so two simultaneous
// submissions cannot both slip under the cap.
// Returns the outbox ids to deliver.
async function insertOrder(db, env, o) {
  const mails = buildEmails(env, o);
  const since = o.now - DAY_MS;
  const results = await db.batch([
    db.prepare(
      `INSERT INTO orders (id, created_at, updated_at, full_name, email, company,
         aws_service, description, budget, deadline, status, source)
       VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'new', 'form')`
    ).bind(o.orderId, o.now, o.name, o.email, o.company, o.service, o.description, o.budget, o.deadline),
    db.prepare(
      `INSERT INTO order_events (order_id, at, actor, type, to_status)
       VALUES (?1, ?2, 'form', 'created', 'new')`
    ).bind(o.orderId, o.now),
    db.prepare(
      `INSERT INTO email_outbox (order_id, kind, to_addr, reply_to, subject, html, created_at)
       SELECT ?1, 'order_client', ?2, ?3, ?4, ?5, ?6
       WHERE (SELECT COUNT(*) FROM email_outbox
              WHERE kind = 'order_client' AND to_addr = ?2 AND created_at > ?7) < ?8
       RETURNING id`
    ).bind(
      o.orderId, mails.client.to, mails.client.replyTo, mails.client.subject, mails.client.html,
      o.now, since, CLIENT_CONFIRMATIONS_PER_DAY,
    ),
    db.prepare(
      `INSERT INTO order_events (order_id, at, actor, type, body)
       SELECT ?1, ?2, 'system', 'note', ?3
       WHERE NOT EXISTS (SELECT 1 FROM email_outbox WHERE order_id = ?1 AND kind = 'order_client')`
    ).bind(
      o.orderId, o.now,
      `Customer confirmation not sent: this address already got ${CLIENT_CONFIRMATIONS_PER_DAY} in the last 24 hours (anti-relay limit). Reply manually if the order is genuine.`,
    ),
    enqueueStatement(db, { orderId: o.orderId, kind: "order_admin", now: o.now, ...mails.admin }),
  ]);
  // Statements 2 (customer, maybe skipped) and 4 (admin) return outbox ids.
  return [results[2], results[4]].flatMap((r) => r.results.map((row) => row.id));
}

// Validates the body and returns trimmed strings, or { error }.
// Single-line fields lose line breaks so they cannot reshape email subjects.
function normalize(body) {
  const value = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const raw = body[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      return { error: `Invalid ${key}` };
    }
    let text = (raw || "").trim();
    if (key !== "description") text = text.replace(/[\r\n\t]+/g, " ");
    if (text.length > max) {
      return { error: `The ${key} field is too long (max ${max} characters)` };
    }
    value[key] = text;
  }
  value.email = value.email.toLowerCase();

  if (REQUIRED.some((key) => !value[key])) {
    return { error: "Missing required fields" };
  }
  if (!EMAIL_RE.test(value.email)) {
    return { error: "Invalid email" };
  }
  return { value };
}

// Parses TURNSTILE_HOSTNAMES ("roussev.dev,*.my-site.pages.dev") into a matcher.
// "*.example.com" matches any subdomain of example.com, not example.com itself.
function hostnameAllowed(allowlist, hostname) {
  if (typeof hostname !== "string" || hostname === "") return false;
  return allowlist.some((entry) =>
    entry.startsWith("*.") ? hostname.endsWith(entry.slice(1)) : hostname === entry
  );
}

// Server-side Turnstile check. Fails closed: missing configuration, network
// errors and timeouts all reject the submission instead of letting it through.
async function verifyTurnstile(env, token, request) {
  // Tolerate common paste mistakes: "https://roussev.dev/", quotes, spaces.
  const allowlist = (env.TURNSTILE_HOSTNAMES || "")
    .split(/[,\s]+/)
    .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/^https?:\/\//, "").replace(/[/:].*$/, ""))
    .filter(Boolean);
  const secret = (env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret || allowlist.length === 0) {
    console.error("TURNSTILE_SECRET_KEY or TURNSTILE_HOSTNAMES is not set; refusing order submissions");
    return { ok: false, status: 503, error: "The form is temporarily unavailable. Please email me directly." };
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, status: 403, error: "Please complete the verification check." };
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  let result;
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    result = await res.json();
  } catch (err) {
    console.error(`Turnstile siteverify error: ${redact(err)}`);
    return { ok: false, status: 502, error: "Verification is unavailable right now. Please try again." };
  }

  // The token must be for this form (action) and an approved site (hostname),
  // so a token solved elsewhere with the same site key is not accepted here.
  // A short reason code is returned to the browser so a misconfiguration can be
  // diagnosed without dashboard logs. It holds no secret: only Cloudflare's
  // error codes or which check failed.
  let reason = null;
  if (result.success !== true) reason = (result["error-codes"] || ["unknown"]).join(",");
  else if (result.action !== TURNSTILE_ACTION) reason = "action-mismatch";
  else if (!hostnameAllowed(allowlist, result.hostname)) reason = "hostname-not-allowed";
  if (reason) {
    console.warn("Turnstile rejected:", JSON.stringify({
      reason, action: result.action, hostname: result.hostname, allowlist,
    }));
    return { ok: false, status: 403, error: `Verification failed (${reason}). Please refresh the page and try again.` };
  }
  return { ok: true };
}

// ORD- plus 7 characters from a 32-symbol alphabet (no 0/O, 1/I).
// 256 is a multiple of 32, so the modulo adds no bias.
function generateOrderId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return "ORD-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

const escapeMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");

// Subject, HTML and addresses of both emails for one order.
function buildEmails(env, order) {
  const { ADMIN_EMAIL } = env;

  // Every value typed by the visitor is escaped before it goes into HTML.
  const e = {
    orderId: escapeHtml(order.orderId),
    name: escapeHtml(order.name),
    email: escapeHtml(order.email),
    company: escapeHtml(order.company),
    service: escapeHtml(order.service),
    description: escapeMultiline(order.description),
    budget: escapeHtml(order.budget),
    deadline: escapeHtml(order.deadline),
  };

  // The confirmation repeats nothing the visitor typed: anyone can put any
  // address into the form, so free text here would let strangers use it to
  // deliver their own message from roussev.dev. The order id is generated
  // by us; the details stay in the admin email and the dashboard.
  const clientHtml = `
    <h2>Thank you for your inquiry</h2>
    <p>I have received your request and will get back to you within 24 hours.</p>
    <p><strong>Order ID:</strong> ${e.orderId}</p>
    <p>If you did not send this request, you can ignore this email.</p>
    <hr>
    <p>Best regards,<br>Bogomil Roussev<br>AWS & Terraform Automation Consultant</p>
  `;

  const adminHtml = `
    <h2>New Order: ${e.orderId}</h2>
    <p><strong>Name:</strong> ${e.name}</p>
    <p><strong>Email:</strong> ${e.email}</p>
    ${e.company ? `<p><strong>Company:</strong> ${e.company}</p>` : ""}
    <p><strong>Service:</strong> ${e.service}</p>
    <p><strong>Description:</strong><br>${e.description}</p>
    ${e.budget ? `<p><strong>Budget:</strong> ${e.budget}</p>` : ""}
    ${e.deadline ? `<p><strong>Deadline:</strong> ${e.deadline}</p>` : ""}
  `;

  return {
    client: {
      to: order.email,
      replyTo: ADMIN_EMAIL || "",
      subject: `Order Confirmed: ${order.orderId}`,
      html: clientHtml,
    },
    admin: {
      to: ADMIN_EMAIL,
      replyTo: order.email,
      subject: `New Order: ${order.orderId} from ${order.name}`,
      html: adminHtml,
    },
  };
}
