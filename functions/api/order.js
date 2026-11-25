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

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "https://roussev.dev",
    "Content-Type": "application/json",
  };
  const reply = (status, payload) => new Response(JSON.stringify(payload), { status, headers });

  let body;
  try {
    body = await request.json();
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
  const date = new Date().toISOString().split("T")[0];

  // Write to Google Sheets
  try {
    await appendToSheet(env, [
      orderId, date, name, email,
      company, service, description,
      budget, deadline, "New",
    ]);
  } catch (err) {
    console.error("Sheets error:", err);
    return reply(500, { error: "Failed to save order" });
  }

  // Emails run after the response is returned; a failure never loses the order.
  context.waitUntil(
    sendEmails(env, { orderId, name, email, company, service, description, budget, deadline })
      .catch((err) => console.error("Email error:", err))
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

async function appendToSheet(env, row) {
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SPREADSHEET_ID } = env;

  const token = await getGoogleToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);

  // Resolve the real tab title from the spreadsheet instead of hard-coding it.
  // Non-Latin sheet names (e.g. "Поръчки") must be single-quoted in A1 notation,
  // and a stray space in the tab name silently breaks the range with
  // "Unable to parse range". Looking it up removes both failure modes.
  const sheetTitle = await getFirstSheetTitle(GOOGLE_SPREADSHEET_ID, token);
  const range = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A:J`);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${text}`);
  }
}

// Reads the title of the first tab so the append range never depends on a
// hand-typed sheet name. The service account already has access (it can write),
// so this read succeeds with the same token.
async function getFirstSheetTitle(spreadsheetId, token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    throw new Error(`Sheets metadata error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const title = data?.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("No sheets found in spreadsheet");
  return title;
}

async function getGoogleToken(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const header = { alg: "RS256", typ: "JWT" };
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import private key — robust against literal "\n", real newlines, stray
  // quotes, and PKCS1/PKCS8 marker variants. Order matters: convert escaped
  // newlines and drop the BEGIN/END markers BEFORE stripping non-base64 chars,
  // otherwise the marker letters would corrupt the decoded key.
  const pemBody = privateKeyPem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [\w ]+-----/g, "")
    .replace(/-----END [\w ]+-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  if (!pemBody) {
    throw new Error("GOOGLE_PRIVATE_KEY is empty or malformed");
  }

  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get Google token");
  return tokenData.access_token;
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
  const allowlist = (env.TURNSTILE_HOSTNAMES || "")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!env.TURNSTILE_SECRET_KEY || allowlist.length === 0) {
    console.error("TURNSTILE_SECRET_KEY or TURNSTILE_HOSTNAMES is not set; refusing order submissions");
    return { ok: false, status: 503, error: "The form is temporarily unavailable. Please email me directly." };
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, status: 403, error: "Please complete the verification check." };
  }

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
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
    console.error("Turnstile siteverify error:", err);
    return { ok: false, status: 502, error: "Verification is unavailable right now. Please try again." };
  }

  // The token must be for this form (action) and an approved site (hostname),
  // so a token solved elsewhere with the same site key is not accepted here.
  if (result.success !== true || result.action !== TURNSTILE_ACTION || !hostnameAllowed(allowlist, result.hostname)) {
    console.warn("Turnstile rejected:", JSON.stringify({
      codes: result["error-codes"], action: result.action, hostname: result.hostname,
    }));
    return { ok: false, status: 403, error: "Verification failed. Please refresh the page and try again." };
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

async function sendEmails(env, order) {
  const { RESEND_API_KEY, FROM_EMAIL, ADMIN_EMAIL } = env;

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

  const clientHtml = `
    <h2>Thank you for your inquiry, ${e.name}!</h2>
    <p>I have received your request and will get back to you within 24 hours.</p>
    <hr>
    <p><strong>Order ID:</strong> ${e.orderId}</p>
    <p><strong>Service:</strong> ${e.service}</p>
    <p><strong>Description:</strong><br>${e.description}</p>
    ${e.budget ? `<p><strong>Budget:</strong> ${e.budget}</p>` : ""}
    ${e.deadline ? `<p><strong>Deadline:</strong> ${e.deadline}</p>` : ""}
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

  const send = async (label, payload) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, ...payload }),
    });
    if (!res.ok) {
      throw new Error(`Resend ${label} email failed: ${res.status} ${await res.text()}`);
    }
  };

  const results = await Promise.allSettled([
    send("client", {
      to: order.email,
      reply_to: ADMIN_EMAIL,
      subject: `Order Confirmed: ${order.orderId}`,
      html: clientHtml,
    }),
    send("admin", {
      to: ADMIN_EMAIL,
      reply_to: order.email,
      subject: `New Order: ${order.orderId} from ${order.name}`,
      html: adminHtml,
    }),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error(r.reason);
  }
}
