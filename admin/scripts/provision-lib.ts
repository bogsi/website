// Idempotent provisioning for the Control Room. Every step reads the current
// state first and only creates or changes what is missing or different, so the
// script can run on every deploy. The CLI wrapper is scripts/provision.ts.

export const NAMES = {
  database: "roussev-orders",
  pagesProject: "website",
  adminHost: "admin.roussev.dev",
  accessApp: "Control Room",
  accessPolicy: "Control Room admins",
  idp: "GitHub",
  pagesExclude: "admin/*",
} as const;

type CfEnvelope<T> = { success: boolean; errors?: { code: number; message: string }[]; result: T };

// No parameter properties: this file runs with Node's type stripping.
export class CfError extends Error {
  readonly status: number;
  readonly codes: number[];
  constructor(status: number, codes: number[], message: string) {
    super(message);
    this.status = status;
    this.codes = codes;
  }
}

export type Cf = <T>(method: string, path: string, body?: unknown) => Promise<T>;

/** Minimal Cloudflare API client: unwraps `result`, throws CfError otherwise. */
export function cfClient(token: string, fetchImpl: typeof fetch = fetch): Cf {
  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    if (!res.ok || !json?.success) {
      const errors = json?.errors ?? [];
      throw new CfError(
        res.status,
        errors.map((e) => e.code),
        `${method} ${path} → ${res.status}: ${errors.map((e) => `${e.code} ${e.message}`).join("; ") || "no details"}`,
      );
    }
    return json.result;
  };
}

export type Log = (line: string) => void;

// ── Zero Trust organization ────────────────────────────────────────────────

export async function getTeamDomain(cf: Cf, accountId: string): Promise<string> {
  try {
    const org = await cf<{ auth_domain?: string }>("GET", `/accounts/${accountId}/access/organizations`);
    if (org.auth_domain) return `https://${org.auth_domain}`;
  } catch (err) {
    if (!(err instanceof CfError) || err.status >= 500) throw err;
  }
  throw new Error(
    "Zero Trust is not set up on this account. Open https://one.dash.cloudflare.com once, choose a team name and the Free plan, then run this again.",
  );
}

export const ORG_BRANDING = {
  name: "roussev.dev",
  login_design: {
    background_color: "#1f2125",
    text_color: "#e6e6e6",
    header_text: "roussev.dev · Control Room",
    footer_text: "Private admin area",
  },
} as const;

type Org = Record<string, unknown> & { name?: string; login_design?: Record<string, unknown> };

/**
 * Sets the name and colours shown on the Access login page (by default the
 * name is the random team name Cloudflare picked at signup). The organization
 * is sent back whole, with only these fields changed, so no other Zero Trust
 * setting is touched. Best effort: a failure is logged, not fatal.
 */
export async function ensureOrgBranding(cf: Cf, accountId: string, log: Log) {
  const path = `/accounts/${accountId}/access/organizations`;
  try {
    const org = await cf<Org>("GET", path);
    const same =
      org.name === ORG_BRANDING.name &&
      Object.entries(ORG_BRANDING.login_design).every(([k, v]) => org.login_design?.[k] === v);
    if (same) {
      log("Access: login page branding already set");
      return;
    }
    // Read-only timestamps and empty values (e.g. "" durations) make the PUT
    // fail with 12062 invalid_org_config, so only real settings go back.
    const { created_at: _c, updated_at: _u, ...rest } = org;
    const kept = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== ""));
    await cf("PUT", path, {
      ...kept,
      name: ORG_BRANDING.name,
      login_design: { ...(org.login_design ?? {}), ...ORG_BRANDING.login_design },
    });
    log(`Access: login page now titled "${ORG_BRANDING.name}" (was "${org.name ?? ""}")`);
  } catch (err) {
    log(`Access: could not set login page branding (${(err as Error).message}); set it under Zero Trust → Settings → Custom pages`);
  }
}

// ── D1 ─────────────────────────────────────────────────────────────────────

type D1Db = { uuid: string; name: string };

export async function ensureD1(cf: Cf, accountId: string, log: Log): Promise<string> {
  const list = await cf<D1Db[]>("GET", `/accounts/${accountId}/d1/database?name=${NAMES.database}&per_page=100`);
  const existing = list.find((d) => d.name === NAMES.database);
  if (existing) {
    log(`D1 ${NAMES.database}: exists (${existing.uuid})`);
    return existing.uuid;
  }
  const created = await cf<D1Db>("POST", `/accounts/${accountId}/d1/database`, { name: NAMES.database });
  log(`D1 ${NAMES.database}: created (${created.uuid})`);
  return created.uuid;
}

// ── Pages project ──────────────────────────────────────────────────────────

type EnvVar = { type: "plain_text" | "secret_text"; value?: string } | null;
export type PagesProject = {
  name: string;
  source?: { type: string; config: Record<string, unknown> & { path_excludes?: string[] } };
  deployment_configs: {
    production: { env_vars?: Record<string, EnvVar> | null; d1_databases?: Record<string, { id: string }> | null };
  };
};

export async function getPagesProject(cf: Cf, accountId: string): Promise<PagesProject> {
  return cf<PagesProject>("GET", `/accounts/${accountId}/pages/projects/${NAMES.pagesProject}`);
}

/** Plain-text production variable of the Pages project (secrets are not readable). */
export function pagesVar(project: PagesProject, name: string): string | undefined {
  const v = project.deployment_configs.production.env_vars?.[name];
  return v && v.type === "plain_text" && v.value ? v.value : undefined;
}

/**
 * Binds D1 as `DB` to Pages production only. The PATCH body carries nothing
 * but that binding: the Pages API merges deployment_configs, so environment
 * variables and secrets are left as they are. Returns true if it changed.
 */
export async function ensurePagesBinding(cf: Cf, accountId: string, project: PagesProject, dbId: string, log: Log) {
  const current = project.deployment_configs.production.d1_databases?.DB?.id;
  if (current === dbId) {
    log("Pages: DB binding already set");
    return false;
  }
  await cf("PATCH", `/accounts/${accountId}/pages/projects/${NAMES.pagesProject}`, {
    deployment_configs: { production: { d1_databases: { DB: { id: dbId } } } },
  });
  log(`Pages: bound D1 as DB on production${current ? ` (was ${current})` : ""}`);
  return true;
}

/** Re-runs the latest production deployment so a new binding takes effect. */
export async function redeployPagesProduction(cf: Cf, accountId: string, log: Log) {
  const base = `/accounts/${accountId}/pages/projects/${NAMES.pagesProject}/deployments`;
  const deployments = await cf<{ id: string; environment: string }[]>("GET", `${base}?env=production&per_page=1`);
  const latest = deployments.find((d) => d.environment === "production");
  if (!latest) {
    log("Pages: no production deployment to retry; the next push will pick up the binding");
    return;
  }
  await cf("POST", `${base}/${latest.id}/retry`);
  log(`Pages: retried production deployment ${latest.id}`);
}

/** Adds admin/* to the Pages build watch-path excludes. Best effort. */
export async function ensurePagesExclude(cf: Cf, accountId: string, project: PagesProject, log: Log) {
  const source = project.source;
  if (!source) return;
  const excludes = source.config.path_excludes ?? [];
  if (excludes.includes(NAMES.pagesExclude)) return;
  try {
    await cf("PATCH", `/accounts/${accountId}/pages/projects/${NAMES.pagesProject}`, {
      source: { type: source.type, config: { ...source.config, path_excludes: [...excludes, NAMES.pagesExclude] } },
    });
    log(`Pages: build watch paths now exclude ${NAMES.pagesExclude}`);
  } catch (err) {
    log(`Pages: could not set watch-path excludes (${(err as Error).message}); set it in the dashboard if you want to skip site builds for admin-only changes`);
  }
}

// ── Access: identity provider, policy, application ─────────────────────────

type Idp = { id: string; type: string; name: string };

export async function ensureGithubIdp(
  cf: Cf,
  accountId: string,
  creds: { clientId?: string; clientSecret?: string },
  log: Log,
): Promise<string> {
  const base = `/accounts/${accountId}/access/identity_providers`;
  const existing = (await cf<Idp[]>("GET", base)).find((i) => i.type === "github");
  const haveCreds = Boolean(creds.clientId && creds.clientSecret);
  const body = { name: NAMES.idp, type: "github", config: { client_id: creds.clientId, client_secret: creds.clientSecret } };
  if (existing) {
    if (haveCreds) {
      await cf("PUT", `${base}/${existing.id}`, body);
      log(`Access: GitHub login updated (${existing.id})`);
    } else {
      log(`Access: GitHub login exists (${existing.id})`);
    }
    return existing.id;
  }
  if (!haveCreds) {
    throw new Error("No GitHub login in Access yet: set ACCESS_GITHUB_CLIENT_ID and ACCESS_GITHUB_CLIENT_SECRET (see admin/README.md).");
  }
  const created = await cf<Idp>("POST", base, body);
  log(`Access: GitHub login created (${created.id})`);
  return created.id;
}

type Policy = { id: string; name: string };

export async function ensurePolicy(cf: Cf, accountId: string, emails: string[], log: Log): Promise<string> {
  if (emails.length === 0) throw new Error("No admin email: set ADMIN_EMAIL on the Pages project or ADMIN_ALLOWED_EMAILS.");
  const base = `/accounts/${accountId}/access/policies`;
  const body = {
    name: NAMES.accessPolicy,
    decision: "allow",
    include: emails.map((email) => ({ email: { email } })),
    session_duration: "24h",
  };
  const existing = (await cf<Policy[]>("GET", `${base}?per_page=100`)).find((p) => p.name === NAMES.accessPolicy);
  if (existing) {
    await cf("PUT", `${base}/${existing.id}`, body);
    log(`Access: policy "${NAMES.accessPolicy}" allows ${emails.join(", ")}`);
    return existing.id;
  }
  const created = await cf<Policy>("POST", base, body);
  log(`Access: policy "${NAMES.accessPolicy}" created for ${emails.join(", ")}`);
  return created.id;
}

type App = { id: string; aud: string; domain?: string; name: string };

export async function ensureAccessApp(cf: Cf, accountId: string, idpId: string, policyId: string, log: Log): Promise<string> {
  const base = `/accounts/${accountId}/access/apps`;
  const body = {
    name: NAMES.accessApp,
    type: "self_hosted",
    domain: NAMES.adminHost,
    session_duration: "24h",
    allowed_idps: [idpId],
    auto_redirect_to_identity: true,
    app_launcher_visible: false,
    policies: [{ id: policyId, precedence: 1 }],
  };
  const existing = (await cf<App[]>("GET", `${base}?per_page=100`)).find((a) => a.domain === NAMES.adminHost);
  const app = existing ? await cf<App>("PUT", `${base}/${existing.id}`, body) : await cf<App>("POST", base, body);
  log(`Access: application ${NAMES.adminHost} ${existing ? "updated" : "created"} (aud ${app.aud.slice(0, 8)}…)`);
  return app.aud;
}

// ── Wrangler config ────────────────────────────────────────────────────────

export type DeployValues = { databaseId: string; teamDomain: string; aud: string; fromEmail: string; adminEmail: string };

/** Fills the REPLACE_ placeholders of wrangler.jsonc; fails if any remain. */
export function renderWranglerConfig(template: string, v: DeployValues): string {
  const out = template
    .replace("REPLACE_WITH_D1_DATABASE_ID", v.databaseId)
    .replace("https://REPLACE_TEAM.cloudflareaccess.com", v.teamDomain)
    .replace("REPLACE_WITH_ACCESS_APPLICATION_AUD", v.aud)
    .replace("REPLACE_WITH_FROM_EMAIL", v.fromEmail)
    .replace("REPLACE_WITH_ADMIN_EMAIL", v.adminEmail);
  const left = out.match(/REPLACE_[A-Z_]+/g);
  if (left) throw new Error(`wrangler.jsonc still has placeholders: ${left.join(", ")}`);
  return out;
}

export const callbackUrl = (teamDomain: string) => `${teamDomain}/cdn-cgi/access/callback`;
