import { describe, expect, it } from "vitest";
import { CfError, type Cf } from "../scripts/provision-lib.ts";
import {
  RATE_LIMIT_RULE,
  TLS_SETTINGS,
  ensureDnssec,
  ensureRateLimit,
  ensureSiteVerification,
  ensureTlsSettings,
  reviewAccess,
} from "../scripts/zone-hardening-lib.ts";

type Call = { method: string; path: string; body?: unknown };

/** Fake Cloudflare API over a small in-memory zone state. */
function fakeZone(init: {
  dnssec?: string;
  settings?: Record<string, string>;
  rules?: Record<string, unknown>[] | null;
  txt?: string[];
}) {
  const state = {
    dnssec: init.dnssec ?? "disabled",
    settings: { ssl: "full", min_tls_version: "1.0", tls_1_3: "on", always_use_https: "off", automatic_https_rewrites: "off", ...init.settings },
    rules: init.rules === undefined ? null : init.rules,
    txt: init.txt ?? [],
  };
  const calls: Call[] = [];
  const cf: Cf = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    calls.push({ method, path, body });
    const setting = path.match(/\/settings\/(\w+)$/)?.[1];
    if (path.endsWith("/dnssec")) {
      if (method === "PATCH") state.dnssec = "pending";
      return { status: state.dnssec } as T;
    }
    if (setting) {
      if (method === "PATCH") state.settings[setting as keyof typeof state.settings] = (body as { value: string }).value;
      return { id: setting, value: state.settings[setting as keyof typeof state.settings] } as T;
    }
    if (path.endsWith("/http_ratelimit/entrypoint")) {
      if (method === "PUT") {
        state.rules = (body as { rules: Record<string, unknown>[] }).rules.map((r) => ({
          ...r,
          id: "r1",
          enabled: true,
          ratelimit: { ...(r.ratelimit as object), requests_to_origin: false },
        }));
      }
      if (state.rules === null) throw new CfError(404, [10003], "not found");
      return { id: "rs1", rules: state.rules } as T;
    }
    if (path.includes("/dns_records")) {
      if (method === "POST") state.txt.push((body as { content: string }).content);
      return state.txt.map((content, i) => ({ id: `d${i}`, type: "TXT", name: "roussev.dev", content })) as T;
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  const writes = () => calls.filter((c) => c.method !== "GET");
  return { cf, state, calls, writes };
}

const quiet = () => undefined;

describe("zone hardening", () => {
  it("check mode never writes", async () => {
    const z = fakeZone({});
    await ensureDnssec(z.cf, "z", "check", quiet);
    await ensureTlsSettings(z.cf, "z", "check", quiet);
    await ensureRateLimit(z.cf, "z", "check", quiet);
    await ensureSiteVerification(z.cf, "z", "google-site-verification=abcdefghijklmnopqrstuvwxyz", "check", quiet);
    expect(z.writes()).toEqual([]);
  });

  it("apply enables DNSSEC and the safe TLS settings but never the SSL mode", async () => {
    const z = fakeZone({});
    await ensureDnssec(z.cf, "z", "apply", quiet);
    await ensureTlsSettings(z.cf, "z", "apply", quiet);
    expect(z.state.dnssec).toBe("pending");
    for (const [id, value] of Object.entries(TLS_SETTINGS)) expect(z.state.settings[id as keyof typeof z.state.settings]).toBe(value);
    expect(z.state.settings.ssl).toBe("full");
    expect(z.writes().some((c) => c.path.endsWith("/settings/ssl"))).toBe(false);
  });

  it("creates the rate limit once and is idempotent afterwards", async () => {
    const z = fakeZone({ rules: null });
    await ensureRateLimit(z.cf, "z", "apply", quiet);
    expect(z.state.rules).toHaveLength(1);
    const before = z.writes().length;
    await ensureRateLimit(z.cf, "z", "apply", quiet);
    expect(z.writes().length).toBe(before);
  });

  it("never overwrites a rate limit rule made by hand", async () => {
    const manual = { id: "x", ref: "manual", description: "Login limit", expression: "true" };
    const z = fakeZone({ rules: [manual] });
    const lines: string[] = [];
    await ensureRateLimit(z.cf, "z", "apply", (l) => lines.push(l));
    expect(z.writes()).toEqual([]);
    expect(lines.join()).toContain("skipped");
  });

  it("updates our own rule when its limits differ", async () => {
    const z = fakeZone({ rules: [{ ...RATE_LIMIT_RULE, id: "r1", ratelimit: { ...RATE_LIMIT_RULE.ratelimit, requests_per_period: 50 } }] });
    await ensureRateLimit(z.cf, "z", "apply", quiet);
    expect(z.writes()).toHaveLength(1);
  });

  it("adds the Search Console TXT once and rejects malformed values", async () => {
    const z = fakeZone({});
    const v = "google-site-verification=abcdefghijklmnopqrstuvwxyz";
    await ensureSiteVerification(z.cf, "z", v, "apply", quiet);
    await ensureSiteVerification(z.cf, "z", v, "apply", quiet);
    expect(z.state.txt).toEqual([`"${v}"`]);
    await expect(ensureSiteVerification(z.cf, "z", "v=spf1 -all", "apply", quiet)).rejects.toThrow();
  });

  it("flags broad allow and bypass Access policies", async () => {
    const cf: Cf = async <T>(_m: string, path: string): Promise<T> =>
      (path.endsWith("/apps")
        ? [{ id: "a", name: "Control Room", type: "self_hosted", domain: "admin.roussev.dev", policies: [{ name: "Control Room admins" }] }]
        : [
            { name: "Control Room admins", decision: "allow", include: [{ email: { email: "x@example.com" } }] },
            { name: "Open", decision: "allow", include: [{ everyone: {} }] },
            { name: "Skip", decision: "bypass", include: [{ ip: { ip: "1.2.3.4/32" } }] },
          ]) as T;
    const findings = await reviewAccess(cf, "acc", quiet);
    expect(findings).toHaveLength(2);
    expect(findings.join()).toContain("Open");
    expect(findings.join()).toContain("Skip");
  });
});
