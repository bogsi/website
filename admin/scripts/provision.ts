// Sets up and deploys the Control Room end to end. Safe to re-run.
//
//   node scripts/provision.ts check    # read-only: prints what exists and the GitHub callback URL
//   node scripts/provision.ts deploy   # creates what is missing, migrates D1, deploys, binds Pages
//
// Environment:
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID        required
//   ACCESS_GITHUB_CLIENT_ID, ACCESS_GITHUB_CLIENT_SECRET needed until the GitHub login exists
//   RESEND_API_KEY                                     stored as a Worker secret when set
//   ADMIN_ALLOWED_EMAILS                               optional, comma-separated; default: ADMIN_EMAIL of the Pages project

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NAMES,
  callbackUrl,
  cfClient,
  ensureAccessApp,
  ensureD1,
  ensureGithubIdp,
  ensureOrgBranding,
  ensurePagesBinding,
  ensurePagesExclude,
  ensurePolicy,
  getPagesProject,
  getTeamDomain,
  pagesVar,
  redeployPagesProduction,
  renderWranglerConfig,
} from "./provision-lib.ts";

const adminDir = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] ?? "check";
const log = (line: string) => console.log(`• ${line}`);

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function wrangler(args: string[], input?: string) {
  console.log(`$ wrangler ${args.join(" ")}`);
  const r = spawnSync("npx", ["wrangler", ...args], {
    cwd: adminDir,
    stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    input,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`wrangler ${args[0]} failed (exit ${r.status})`);
}

async function main() {
  const accountId = need("CLOUDFLARE_ACCOUNT_ID");
  const cf = cfClient(need("CLOUDFLARE_API_TOKEN"));

  const teamDomain = await getTeamDomain(cf, accountId);
  log(`Zero Trust team: ${teamDomain}`);
  log(`GitHub OAuth App callback URL: ${callbackUrl(teamDomain)}`);

  const project = await getPagesProject(cf, accountId);
  const fromEmail = pagesVar(project, "FROM_EMAIL");
  const adminEmail = pagesVar(project, "ADMIN_EMAIL");
  const allowed = (process.env.ADMIN_ALLOWED_EMAILS || adminEmail || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  log(`Pages project "${NAMES.pagesProject}": FROM_EMAIL ${fromEmail ? "found" : "MISSING"}, ADMIN_EMAIL ${adminEmail ?? "MISSING"}`);

  if (mode === "check") {
    const hasIdp = (await cf<{ type: string }[]>("GET", `/accounts/${accountId}/access/identity_providers`)).some((i) => i.type === "github");
    log(`Access GitHub login: ${hasIdp ? "configured" : "not yet (needs ACCESS_GITHUB_CLIENT_ID/SECRET)"}`);
    log(`Admin access will be allowed for: ${allowed.join(", ") || "nobody (set ADMIN_ALLOWED_EMAILS)"}`);
    log(`Resend key for the admin Worker: ${process.env.RESEND_API_KEY ? "provided" : "not provided"}`);
    return;
  }
  if (mode !== "deploy") throw new Error(`unknown mode "${mode}" (use check or deploy)`);
  if (!fromEmail || !adminEmail) {
    throw new Error("FROM_EMAIL and ADMIN_EMAIL must be plain-text variables on the Pages project (the order form already uses them).");
  }

  const databaseId = await ensureD1(cf, accountId, log);
  const idpId = await ensureGithubIdp(
    cf,
    accountId,
    { clientId: process.env.ACCESS_GITHUB_CLIENT_ID, clientSecret: process.env.ACCESS_GITHUB_CLIENT_SECRET },
    log,
  );
  const policyId = await ensurePolicy(cf, accountId, allowed, log);
  const aud = await ensureAccessApp(cf, accountId, idpId, policyId, log);
  await ensureOrgBranding(cf, accountId, log);

  // Access is in place before the Worker gets its public hostname.
  const config = renderWranglerConfig(readFileSync(`${adminDir}/wrangler.jsonc`, "utf8"), {
    databaseId, teamDomain, aud, fromEmail, adminEmail,
  });
  writeFileSync(`${adminDir}/wrangler.ci.jsonc`, config);

  wrangler(["d1", "migrations", "apply", NAMES.database, "--remote", "-c", "wrangler.ci.jsonc"]);
  wrangler(["deploy", "-c", "wrangler.ci.jsonc"]);
  if (process.env.RESEND_API_KEY) {
    wrangler(["secret", "put", "RESEND_API_KEY", "-c", "wrangler.ci.jsonc"], process.env.RESEND_API_KEY);
  } else {
    log("RESEND_API_KEY not provided: status emails stay queued until it is set");
  }

  if (await ensurePagesBinding(cf, accountId, project, databaseId, log)) {
    await redeployPagesProduction(cf, accountId, log);
  }
  await ensurePagesExclude(cf, accountId, project, log);

  log(`Done: https://${NAMES.adminHost}`);
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
