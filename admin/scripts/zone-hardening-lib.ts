// One-shot zone hardening for roussev.dev (tasks T02, T03, T07, T13, T18).
// Runs with a short-lived token that is deleted after the run, so the
// long-lived deploy token keeps its narrow scope. Every step reads first and
// changes only what differs; "check" mode never writes.
//
// Deliberately NOT changed here:
// - SSL/TLS encryption mode: other proxied hostnames may point at origins
//   that do not have a valid certificate. It is reported, not set.
// - Zone-level HSTS: preload is hard to undo; HSTS is already sent by
//   static/_headers and the admin Worker.

import { CfError, type Cf, type Log } from "./provision-lib.ts";

export const ZONE_NAME = "roussev.dev";

/** Edge TLS settings that are safe for every hostname on the zone. */
export const TLS_SETTINGS: Readonly<Record<string, string>> = {
  min_tls_version: "1.2",
  tls_1_3: "on",
  always_use_https: "on",
  automatic_https_rewrites: "on",
};

// Free plan limits: 1 rule, path-only expression, IP counting, 10 s period
// and 10 s mitigation. A person submits the form once; 5 posts in 10 s from
// one IP is a script.
export const RATE_LIMIT_REF = "order_form_rate_limit";
export const RATE_LIMIT_RULE = {
  ref: RATE_LIMIT_REF,
  description: "Order form: max 5 requests per 10 s per IP",
  expression: '(http.request.uri.path eq "/api/order")',
  action: "block",
  ratelimit: {
    characteristics: ["cf.colo.id", "ip.src"],
    period: 10,
    requests_per_period: 5,
    mitigation_timeout: 10,
  },
} as const;

export type Mode = "check" | "apply";
type Zone = { id: string; name: string; status: string };
type Setting = { id: string; value: unknown };
type Rule = { id?: string; ref?: string; description?: string; expression?: string };
type Ruleset = { id: string; rules?: Rule[] };
type DnsRecord = { id: string; type: string; name: string; content: string };

export async function getZone(cf: Cf, name = ZONE_NAME): Promise<Zone> {
  const zones = await cf<Zone[]>("GET", `/zones?name=${encodeURIComponent(name)}`);
  const zone = zones[0];
  if (!zone) throw new Error(`Zone ${name} not found (does the token include Zone Read for it?)`);
  return zone;
}

// ── T02 DNSSEC ─────────────────────────────────────────────────────────────

export async function ensureDnssec(cf: Cf, zoneId: string, mode: Mode, log: Log): Promise<void> {
  const current = await cf<{ status: string }>("GET", `/zones/${zoneId}/dnssec`);
  if (current.status === "active" || current.status === "pending") {
    log(`DNSSEC: ${current.status}`);
    return;
  }
  if (mode === "check") {
    log(`DNSSEC: ${current.status} → would enable (Cloudflare Registrar adds the DS record itself)`);
    return;
  }
  const next = await cf<{ status: string }>("PATCH", `/zones/${zoneId}/dnssec`, { status: "active" });
  log(`DNSSEC: enabled (${next.status}); Cloudflare Registrar publishes the DS record, usually within a day`);
}

// ── T03 TLS ────────────────────────────────────────────────────────────────

export async function ensureTlsSettings(cf: Cf, zoneId: string, mode: Mode, log: Log): Promise<void> {
  const ssl = await cf<Setting>("GET", `/zones/${zoneId}/settings/ssl`);
  log(`SSL mode: ${String(ssl.value)} (reported only; "strict" is best if every proxied origin has a valid certificate)`);
  for (const [id, wanted] of Object.entries(TLS_SETTINGS)) {
    const current = await cf<Setting>("GET", `/zones/${zoneId}/settings/${id}`);
    // "zrt" = TLS 1.3 on with 0-RTT. Cloudflare reports it while 0-RTT is on
    // (a separate setting, limited to safe GET requests), so it counts as on.
    if (current.value === wanted || (id === "tls_1_3" && current.value === "zrt")) {
      log(`${id}: ${wanted}`);
      continue;
    }
    if (mode === "check") {
      log(`${id}: ${String(current.value)} → would set ${wanted}`);
      continue;
    }
    await cf("PATCH", `/zones/${zoneId}/settings/${id}`, { value: wanted });
    log(`${id}: ${String(current.value)} → ${wanted}`);
  }
}

// ── T07 Rate limit ─────────────────────────────────────────────────────────

type RateLimitedRule = Rule & {
  action?: string;
  ratelimit?: { characteristics?: string[]; period?: number; requests_per_period?: number; mitigation_timeout?: number };
};

/** Compares only the fields we set; the API adds ids, versions and defaults. */
function sameRule(a: RateLimitedRule, b: typeof RATE_LIMIT_RULE): boolean {
  const r = a.ratelimit ?? {};
  return (
    a.expression === b.expression &&
    a.action === b.action &&
    a.description === b.description &&
    r.period === b.ratelimit.period &&
    r.requests_per_period === b.ratelimit.requests_per_period &&
    r.mitigation_timeout === b.ratelimit.mitigation_timeout &&
    [...(r.characteristics ?? [])].sort().join() === [...b.ratelimit.characteristics].sort().join()
  );
}

export async function ensureRateLimit(cf: Cf, zoneId: string, mode: Mode, log: Log): Promise<void> {
  const path = `/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`;
  let rules: Rule[] = [];
  try {
    rules = (await cf<Ruleset>("GET", path)).rules ?? [];
  } catch (err) {
    if (!(err instanceof CfError) || err.status !== 404) throw err;
  }
  const ours = rules.find((r) => r.ref === RATE_LIMIT_REF) as RateLimitedRule | undefined;
  const others = rules.filter((r) => r.ref !== RATE_LIMIT_REF);
  if (others.length > 0) {
    // The Free plan allows one rule: never overwrite one made by hand.
    log(`Rate limit: skipped, the zone already has another rule ("${others[0]?.description ?? others[0]?.id}"). Remove it or adapt it by hand.`);
    return;
  }
  if (ours && sameRule(ours, RATE_LIMIT_RULE)) {
    log("Rate limit: /api/order rule in place");
    return;
  }
  if (mode === "check") {
    log(`Rate limit: would ${ours ? "update" : "create"} the /api/order rule (5 per 10 s per IP)`);
    return;
  }
  await cf("PUT", path, { rules: [RATE_LIMIT_RULE] });
  log(`Rate limit: /api/order rule ${ours ? "updated" : "created"}`);
}

// ── T11 WAF custom rules ───────────────────────────────────────────────────

// Free plan: 5 custom rules, no regex. The site is static Hugo plus one
// JSON endpoint, so PHP, WordPress and dotfile probes are never legitimate.
// /.well-known/ (security.txt) is not matched.
export const CUSTOM_RULES = [
  {
    ref: "block_scanner_paths",
    description: "Block scanner probes (PHP, WordPress, dotfiles)",
    expression:
      '(ends_with(http.request.uri.path, ".php") or http.request.uri.path contains "/wp-" or starts_with(http.request.uri.path, "/.env") or starts_with(http.request.uri.path, "/.git"))',
    action: "block",
  },
  {
    ref: "order_form_post_only",
    description: "Order form accepts POST only",
    expression: '(http.request.uri.path eq "/api/order" and http.request.method ne "POST")',
    action: "block",
  },
] as const;
const FREE_CUSTOM_RULE_LIMIT = 5;

type CustomRule = Rule & { action?: string };

export async function ensureCustomRules(cf: Cf, zoneId: string, mode: Mode, log: Log): Promise<void> {
  const path = `/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`;
  let rules: CustomRule[] = [];
  try {
    rules = (await cf<Ruleset>("GET", path)).rules ?? [];
  } catch (err) {
    if (!(err instanceof CfError) || err.status !== 404) throw err;
  }
  const ourRefs = new Set<string>(CUSTOM_RULES.map((r) => r.ref));
  const others = rules.filter((r) => !ourRefs.has(r.ref ?? ""));
  const pending = CUSTOM_RULES.filter((want) => {
    const have = rules.find((r) => r.ref === want.ref);
    return !have || have.expression !== want.expression || have.action !== want.action || have.description !== want.description;
  });
  if (pending.length === 0) {
    log(`WAF custom rules: ${CUSTOM_RULES.length} in place`);
    return;
  }
  if (others.length + CUSTOM_RULES.length > FREE_CUSTOM_RULE_LIMIT) {
    log(`WAF custom rules: skipped, ${others.length} other rules + ${CUSTOM_RULES.length} ours exceed the Free limit of ${FREE_CUSTOM_RULE_LIMIT}`);
    return;
  }
  if (mode === "check") {
    log(`WAF custom rules: would set ${pending.map((r) => r.ref).join(", ")} (keeping ${others.length} other rule(s))`);
    return;
  }
  // Rules made by hand are kept by id and stay first; ours follow.
  await cf("PUT", path, { rules: [...others.filter((r) => r.id).map((r) => ({ id: r.id })), ...CUSTOM_RULES] });
  log(`WAF custom rules: set ${pending.map((r) => r.ref).join(", ")}`);
}

// ── T28 Email DNS (read-only) ──────────────────────────────────────────────

/**
 * Reports what DMARC alignment needs: one SPF record on the apex, Resend's
 * DKIM key and its bounce subdomain, and a DMARC policy. Prints which
 * records exist (and the DMARC policy tag), never full record values.
 */
export async function reportEmailDns(cf: Cf, zoneId: string, log: Log): Promise<string[]> {
  const findings: string[] = [];
  const get = (name: string, type: string) =>
    cf<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
  const strip = (v: string) => v.replace(/^"|"$/g, "");

  const spf = (await get(ZONE_NAME, "TXT")).filter((r) => strip(r.content).startsWith("v=spf1"));
  if (spf.length !== 1) findings.push(`SPF: ${spf.length} records on ${ZONE_NAME} (exactly one is allowed)`);
  else log(`SPF on ${ZONE_NAME}: one record`);

  const dkim = await get(`resend._domainkey.${ZONE_NAME}`, "TXT");
  if (dkim.length === 0) findings.push("DKIM: resend._domainkey is missing (Resend → Domains shows the record)");
  else log("DKIM (Resend): present");

  const bounce = await get(`send.${ZONE_NAME}`, "MX");
  if (bounce.length === 0) findings.push("Resend bounce domain: MX on send. is missing");
  else log("Resend bounce domain (send.): MX present");

  const dmarc = (await get(`_dmarc.${ZONE_NAME}`, "TXT")).map((r) => strip(r.content)).filter((v) => v.startsWith("v=DMARC1"));
  if (dmarc.length === 0) {
    findings.push("DMARC: missing; enable Email → DMARC Management in the dashboard (it adds the record and receives reports)");
  } else {
    const policy = /\bp=(none|quarantine|reject)/.exec(dmarc[0] ?? "")?.[1] ?? "?";
    const reports = /\brua=/.test(dmarc[0] ?? "") ? "with reports" : "without reports (no rua)";
    log(`DMARC: p=${policy}, ${reports}`);
    if (dmarc.length > 1) findings.push(`DMARC: ${dmarc.length} records (exactly one is allowed)`);
  }
  for (const f of findings) log(`⚠ ${f}`);
  return findings;
}

// ── T18 Search Console verification ───────────────────────────────────────

const VERIFICATION_RE = /^google-site-verification=[A-Za-z0-9_-]{20,100}$/;

export async function ensureSiteVerification(
  cf: Cf,
  zoneId: string,
  value: string | undefined,
  mode: Mode,
  log: Log,
): Promise<void> {
  if (!value) {
    log("Search Console TXT: no value given, skipped");
    return;
  }
  const content = value.trim().replace(/^"|"$/g, "");
  if (!VERIFICATION_RE.test(content)) {
    throw new Error('Search Console value must look like "google-site-verification=..."');
  }
  const records = await cf<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records?type=TXT&name=${ZONE_NAME}`);
  if (records.some((r) => r.content.replace(/^"|"$/g, "") === content)) {
    log("Search Console TXT: present");
    return;
  }
  if (mode === "check") {
    log("Search Console TXT: would add the verification record");
    return;
  }
  await cf("POST", `/zones/${zoneId}/dns_records`, {
    type: "TXT",
    name: ZONE_NAME,
    content: `"${content}"`,
    ttl: 3600,
    comment: "Google Search Console domain verification",
  });
  log("Search Console TXT: added; press Verify in Search Console in a few minutes");
}

// ── T13 Access review (read-only) ──────────────────────────────────────────

type AccessApp = { id: string; name: string; domain?: string; type: string; policies?: { name?: string }[] };
type Policy = {
  name: string;
  decision: string;
  include?: Record<string, unknown>[];
  session_duration?: string;
};

/** Lists every Access app and reusable policy so nothing unexpected grants access. */
export async function reviewAccess(cf: Cf, accountId: string, log: Log): Promise<string[]> {
  const findings: string[] = [];
  const apps = await cf<AccessApp[]>("GET", `/accounts/${accountId}/access/apps`);
  for (const app of apps) {
    const policies = (app.policies ?? []).map((p) => p.name ?? "?").join(", ") || "none";
    log(`Access app: ${app.name} (${app.type}) ${app.domain ?? ""} · policies: ${policies}`);
  }
  const policies = await cf<Policy[]>("GET", `/accounts/${accountId}/access/policies`);
  for (const p of policies) {
    const kinds = (p.include ?? []).map((rule) => Object.keys(rule)[0] ?? "?");
    log(`Access policy: ${p.name} · ${p.decision} · include: ${kinds.join(", ") || "none"} · session: ${p.session_duration ?? "default"}`);
    const broad = kinds.filter((k) => k === "everyone" || k === "email_domain" || k === "any_valid_service_token");
    if (p.decision === "allow" && broad.length > 0) {
      findings.push(`Policy "${p.name}" allows by ${broad.join(", ")}: check that this is intended`);
    }
    if (p.decision === "bypass") findings.push(`Policy "${p.name}" bypasses Access: check that this is intended`);
  }
  for (const f of findings) log(`⚠ ${f}`);
  if (findings.length === 0) log("Access review: no broad allow or bypass policies");
  return findings;
}
