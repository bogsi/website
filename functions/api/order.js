export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "https://roussev.dev",
    "Content-Type": "application/json",
  };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  const { name, email, company, service, description, budget, deadline } = body;

  if (!name || !email || !service || !description) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers });
  }

  const orderId = "ORD-" + Math.random().toString(36).substring(2, 9).toUpperCase();
  const date = new Date().toISOString().split("T")[0];

  // Write to Google Sheets
  try {
    await appendToSheet(env, [
      orderId, date, name, email,
      company || "", service, description,
      budget || "", deadline || "", "New",
    ]);
  } catch (err) {
    console.error("Sheets error:", err);
    return new Response(JSON.stringify({ error: "Failed to save order" }), { status: 500, headers });
  }

  // Send emails via Resend
  try {
    await sendEmails(env, { orderId, name, email, company, service, description, budget, deadline });
  } catch (err) {
    console.error("Email error:", err);
    // Non-fatal — order is saved, email failed
  }

  return new Response(JSON.stringify({ success: true, orderId }), { status: 200, headers });
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

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SPREADSHEET_ID}/values/%D0%9F%D0%BE%D1%80%D1%8A%D1%87%D0%BA%D0%B8!A:J:append?valueInputOption=RAW`;

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

async function sendEmails(env, { orderId, name, email, company, service, description, budget, deadline }) {
  const { RESEND_API_KEY, FROM_EMAIL, ADMIN_EMAIL } = env;

  const clientHtml = `
    <h2>Thank you for your inquiry, ${name}!</h2>
    <p>I have received your request and will get back to you within 24 hours.</p>
    <hr>
    <p><strong>Order ID:</strong> ${orderId}</p>
    <p><strong>Service:</strong> ${service}</p>
    <p><strong>Description:</strong> ${description}</p>
    ${budget ? `<p><strong>Budget:</strong> ${budget}</p>` : ""}
    ${deadline ? `<p><strong>Deadline:</strong> ${deadline}</p>` : ""}
    <hr>
    <p>Best regards,<br>Bogomil Roussev<br>AWS & Terraform Automation Consultant</p>
  `;

  const adminHtml = `
    <h2>New Order: ${orderId}</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    ${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
    <p><strong>Service:</strong> ${service}</p>
    <p><strong>Description:</strong> ${description}</p>
    ${budget ? `<p><strong>Budget:</strong> ${budget}</p>` : ""}
    ${deadline ? `<p><strong>Deadline:</strong> ${deadline}</p>` : ""}
  `;

  await Promise.all([
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: `Order Confirmed: ${orderId}`,
        html: clientHtml,
      }),
    }),
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `New Order: ${orderId} from ${name}`,
        html: adminHtml,
      }),
    }),
  ]);
}
