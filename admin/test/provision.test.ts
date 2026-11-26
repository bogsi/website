import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NAMES,
  cfClient,
  ensureAccessApp,
  ensureD1,
  ensureGithubIdp,
  ensureOrgBranding,
  ORG_BRANDING,
  ensurePagesBinding,
  ensurePagesExclude,
  ensurePolicy,
  getPagesProject,
  getTeamDomain,
  pagesVar,
  redeployPagesProduction,
  renderWranglerConfig,
  type PagesProject,
} from "../scripts/provision-lib.ts";

const ACC = "acc1";

/** In-memory Cloudflare API covering the endpoints the script uses. */
function fakeCloudflare(opts: { org?: boolean } = {}) {
  const state = {
    org: (opts.org === false
      ? null
      : { auth_domain: "roussev.cloudflareaccess.com", name: "quiet-grass-cb24.cloudflareaccess.com", session_duration: "24h", login_design: {} }) as Record<string, unknown> | null,
    d1: [] as { uuid: string; name: string }[],
    idps: [] as { id: string; type: string; name: string; config: unknown }[],
    policies: [] as { id: string; name: string; include: unknown }[],
    apps: [] as { id: string; aud: string; domain: string; name: string; body: unknown }[],
    project: {
      name: "website",
      source: { type: "github", config: { owner: "bogsi", repo_name: "website", production_branch: "main" } },
      deployment_configs: {
        production: {
          env_vars: {
            FROM_EMAIL: { type: "plain_text", value: "orders@roussev.dev" },
            ADMIN_EMAIL: { type: "plain_text", value: "Bogomil@Example.com" },
            RESEND_API_KEY: { type: "secret_text" },
          },
          d1_databases: null,
        },
      },
    } as PagesProject,
    deployments: [{ id: "dep1", environment: "production" }],
    calls: [] as { method: string; path: string; body?: unknown }[],
  };
  let seq = 0;
  const ok = (result: unknown) => Response.json({ success: true, errors: [], result });
  const fail = (status: number, code: number) => Response.json({ success: false, errors: [{ code, message: "nope" }], result: null }, { status });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/client/v4", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    state.calls.push({ method, path: path + url.search, body });
    const a = `/accounts/${ACC}`;

    if (path === `${a}/access/organizations`) {
      if (!state.org) return fail(404, 12130);
      if (method === "PUT") {
        state.org = body;
        return ok(state.org);
      }
      return ok({ ...state.org, created_at: "2026-11-01", updated_at: "2026-11-02" });
    }
    if (path === `${a}/d1/database`) {
      if (method === "GET") return ok(state.d1.filter((d) => d.name === url.searchParams.get("name")));
      const db = { uuid: `db-${++seq}`, name: body.name };
      state.d1.push(db);
      return ok(db);
    }
    if (path === `${a}/access/identity_providers`) {
      if (method === "GET") return ok(state.idps);
      const idp = { id: `idp-${++seq}`, ...body };
      state.idps.push(idp);
      return ok(idp);
    }
    if (path.startsWith(`${a}/access/identity_providers/`) && method === "PUT") return ok({ id: path.split("/").pop() });
    if (path === `${a}/access/policies`) {
      if (method === "GET") return ok(state.policies);
      const p = { id: `pol-${++seq}`, ...body };
      state.policies.push(p);
      return ok(p);
    }
    if (path.startsWith(`${a}/access/policies/`) && method === "PUT") {
      const p = state.policies.find((x) => x.id === path.split("/").pop())!;
      Object.assign(p, body);
      return ok(p);
    }
    if (path === `${a}/access/apps`) {
      if (method === "GET") return ok(state.apps);
      const app = { id: `app-${++seq}`, aud: `aud-${seq}-xxxxxxxx`, domain: body.domain, name: body.name, body };
      state.apps.push(app);
      return ok(app);
    }
    if (path.startsWith(`${a}/access/apps/`) && method === "PUT") {
      const app = state.apps.find((x) => x.id === path.split("/").pop())!;
      app.body = body;
      return ok(app);
    }
    if (path === `${a}/pages/projects/website`) {
      if (method === "GET") return ok(structuredClone(state.project));
      // Merge semantics, as the Pages API does.
      if (body.deployment_configs) Object.assign(state.project.deployment_configs.production, body.deployment_configs.production);
      if (body.source) state.project.source = body.source;
      return ok(state.project);
    }
    if (path === `${a}/pages/projects/website/deployments`) return ok(state.deployments);
    if (path.endsWith("/retry")) return ok({ id: "dep2" });
    return fail(404, 7003);
  }) as typeof fetch;

  return { state, cf: cfClient("token", fetchImpl) };
}

async function runAll(cf: ReturnType<typeof cfClient>, creds = { clientId: "cid", clientSecret: "sec" }) {
  const log: string[] = [];
  const l = (s: string) => log.push(s);
  const team = await getTeamDomain(cf, ACC);
  const project = await getPagesProject(cf, ACC);
  const db = await ensureD1(cf, ACC, l);
  const idp = await ensureGithubIdp(cf, ACC, creds, l);
  const pol = await ensurePolicy(cf, ACC, [pagesVar(project, "ADMIN_EMAIL")!.toLowerCase()], l);
  const aud = await ensureAccessApp(cf, ACC, idp, pol, l);
  if (await ensurePagesBinding(cf, ACC, project, db, l)) await redeployPagesProduction(cf, ACC, l);
  await ensurePagesExclude(cf, ACC, project, l);
  return { team, db, idp, pol, aud, log };
}

describe("provisioning", () => {
  it("creates everything on the first run", async () => {
    const { state, cf } = fakeCloudflare();
    const r = await runAll(cf);
    expect(r.team).toBe("https://roussev.cloudflareaccess.com");
    expect(state.d1).toHaveLength(1);
    expect(state.idps).toEqual([expect.objectContaining({ type: "github", config: { client_id: "cid", client_secret: "sec" } })]);
    expect(state.policies[0]).toMatchObject({ name: NAMES.accessPolicy, include: [{ email: { email: "bogomil@example.com" } }] });
    expect(state.apps[0]!.body).toMatchObject({
      domain: "admin.roussev.dev",
      type: "self_hosted",
      allowed_idps: [r.idp],
      auto_redirect_to_identity: true,
      policies: [{ id: r.pol, precedence: 1 }],
    });
    expect(state.project.deployment_configs.production.d1_databases).toEqual({ DB: { id: r.db } });
    expect(state.calls.some((c) => c.path.endsWith("/deployments/dep1/retry"))).toBe(true);
    expect(state.project.source!.config.path_excludes).toEqual(["admin/*"]);
  });

  it("changes nothing that already matches on the second run", async () => {
    const { state, cf } = fakeCloudflare();
    const first = await runAll(cf);
    state.calls.length = 0;
    const second = await runAll(cf, { clientId: "", clientSecret: "" });
    expect(second.db).toBe(first.db);
    expect(second.aud).toBe(first.aud);
    expect(state.d1).toHaveLength(1);
    expect(state.idps).toHaveLength(1);
    expect(state.apps).toHaveLength(1);
    const writes = state.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path.replace(/\/[^/]+-\d+[^/]*$/, "/:id")}`);
    // Policy and app are re-asserted (PUT); nothing is created, no Pages change, no redeploy.
    expect(writes).toEqual([`PUT /accounts/${ACC}/access/policies/:id`, `PUT /accounts/${ACC}/access/apps/:id`]);
  });

  it("touches only the D1 binding when patching the Pages project", async () => {
    const { state, cf } = fakeCloudflare();
    await runAll(cf);
    const patch = state.calls.find((c) => c.method === "PATCH" && (c.body as { deployment_configs?: unknown }).deployment_configs);
    expect(patch!.body).toEqual({ deployment_configs: { production: { d1_databases: { DB: { id: state.d1[0]!.uuid } } } } });
    expect(state.project.deployment_configs.production.env_vars).toHaveProperty("RESEND_API_KEY");
  });

  it("explains how to enable Zero Trust when it is missing", async () => {
    const { cf } = fakeCloudflare({ org: false });
    await expect(getTeamDomain(cf, ACC)).rejects.toThrow(/Zero Trust is not set up/);
  });

  it("asks for GitHub OAuth credentials only when no GitHub login exists", async () => {
    const { cf } = fakeCloudflare();
    await expect(ensureGithubIdp(cf, ACC, {}, () => {})).rejects.toThrow(/ACCESS_GITHUB_CLIENT_ID/);
    await ensureGithubIdp(cf, ACC, { clientId: "a", clientSecret: "b" }, () => {});
    await expect(ensureGithubIdp(cf, ACC, {}, () => {})).resolves.toMatch(/^idp-/);
  });

  it("renders the deploy config and refuses leftover placeholders", () => {
    const template = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    const out = renderWranglerConfig(template, {
      databaseId: "db-1", teamDomain: "https://t.cloudflareaccess.com", aud: "aud", fromEmail: "f@x", adminEmail: "a@x",
    });
    expect(out).not.toMatch(/REPLACE_/);
    expect(out).toContain('"database_id": "db-1"');
    expect(() => renderWranglerConfig(`${template}\n// REPLACE_SOMETHING_NEW`, {
      databaseId: "x", teamDomain: "x", aud: "x", fromEmail: "x", adminEmail: "x",
    })).toThrow(/REPLACE_SOMETHING_NEW/);
  });
});

describe("login page branding", () => {
  it("renames the organization once and keeps its other settings", async () => {
    const { state, cf } = fakeCloudflare();
    const log: string[] = [];
    await ensureOrgBranding(cf, ACC, (l) => log.push(l));
    expect(state.org).toMatchObject({
      name: ORG_BRANDING.name,
      auth_domain: "roussev.cloudflareaccess.com",
      session_duration: "24h",
      login_design: ORG_BRANDING.login_design,
    });
    expect(state.org).not.toHaveProperty("created_at");
    expect(log[0]).toContain('was "quiet-grass-cb24');

    state.calls.length = 0;
    await ensureOrgBranding(cf, ACC, (l) => log.push(l));
    expect(state.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("never fails the deploy", async () => {
    const { cf } = fakeCloudflare({ org: false });
    const log: string[] = [];
    await expect(ensureOrgBranding(cf, ACC, (l) => log.push(l))).resolves.toBeUndefined();
    expect(log[0]).toContain("could not set login page branding");
  });
});
