// Hardening of the roussev.dev zone (T02, T03, T07, T11, T13, T18, T28 report). Safe to re-run.
//
//   node --experimental-strip-types scripts/zone-hardening.ts check   # read-only report
//   node --experimental-strip-types scripts/zone-hardening.ts apply   # change what differs
//
// Environment:
//   CLOUDFLARE_ZONE_TOKEN     required. Short-lived token, zone roussev.dev only:
//                             Zone Read, Zone Settings Edit, DNS Edit, Zone WAF Edit.
//                             Delete the token and the GitHub secret after the run.
//   CLOUDFLARE_API_TOKEN      optional; the deploy token, used read-only for the Access review
//   CLOUDFLARE_ACCOUNT_ID     optional; needed for the Access review
//   GOOGLE_SITE_VERIFICATION  optional; "google-site-verification=..." from Search Console

import { CfError, cfClient } from "./provision-lib.ts";
import {
  ensureCustomRules,
  ensureDnssec,
  ensureRateLimit,
  ensureSiteVerification,
  ensureTlsSettings,
  getZone,
  reportEmailDns,
  reviewAccess,
  type Mode,
} from "./zone-hardening-lib.ts";

const arg = process.argv[2] ?? "check";
if (arg !== "check" && arg !== "apply") {
  console.error(`Unknown mode "${arg}" (use check or apply)`);
  process.exit(2);
}
const mode: Mode = arg;
const log = (line: string) => console.log(`• ${line}`);

async function main(): Promise<void> {
  const zoneToken = process.env.CLOUDFLARE_ZONE_TOKEN;
  if (!zoneToken) throw new Error("CLOUDFLARE_ZONE_TOKEN is not set");
  const cf = cfClient(zoneToken);
  const zone = await getZone(cf).catch((err: unknown) => {
    if (err instanceof CfError && err.codes.includes(9109)) {
      throw new Error(
        "CLOUDFLARE_ZONE_TOKEN is not a valid token: paste the token value shown once after creating it (not its name or ID), or create a new one",
      );
    }
    throw err;
  });
  log(`Zone ${zone.name} (${zone.status}) · mode ${mode}`);

  // Each step is independent: one missing permission must not hide the rest.
  const steps: [string, () => Promise<unknown>][] = [
    ["DNSSEC", () => ensureDnssec(cf, zone.id, mode, log)],
    ["TLS", () => ensureTlsSettings(cf, zone.id, mode, log)],
    ["Rate limit", () => ensureRateLimit(cf, zone.id, mode, log)],
    ["WAF custom rules", () => ensureCustomRules(cf, zone.id, mode, log)],
    ["Email DNS", () => reportEmailDns(cf, zone.id, log)],
    ["Search Console", () => ensureSiteVerification(cf, zone.id, process.env.GOOGLE_SITE_VERIFICATION, mode, log)],
  ];
  const deployToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (deployToken && accountId) {
    steps.push(["Access review", () => reviewAccess(cfClient(deployToken), accountId, log)]);
  } else {
    log("Access review: skipped (CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set)");
  }

  const failed: string[] = [];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      failed.push(name);
      console.error(`✕ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed.length > 0) {
    console.error(`Failed steps: ${failed.join(", ")} (a 403 usually means a missing token permission)`);
    process.exit(1);
  }
  log(mode === "apply" ? "Done. Delete the zone token and the CLOUDFLARE_ZONE_TOKEN secret now." : "Check done. Run again with apply.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
