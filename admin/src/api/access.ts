import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppEnv } from "./env";

// JWKS fetchers are cached per team domain for the life of the isolate.
const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Verifies the Cloudflare Access JWT on every API request, even though Access
 * already guards the hostname at the edge. If the edge rule were ever removed
 * or bypassed (for example via a workers.dev URL), the API still refuses.
 *
 * Local development only: ACCESS_DEV_EMAIL (in .dev.vars) is honoured when the
 * request host is localhost, so `wrangler dev` works without Access.
 */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const host = new URL(c.req.url).hostname;
  if (c.env.ACCESS_DEV_EMAIL && LOCAL_HOSTS.has(host)) {
    c.set("userEmail", c.env.ACCESS_DEV_EMAIL);
    c.set("sessionExpiresAt", null);
    return next();
  }

  const teamDomain = (c.env.ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");
  const audience = c.env.ACCESS_AUD;
  if (!teamDomain || !audience) {
    console.error("ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set");
    return c.json({ error: "Access is not configured" }, 503);
  }

  const token =
    c.req.header("Cf-Access-Jwt-Assertion") ??
    /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(c.req.header("Cookie") ?? "")?.[1];
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: teamDomain,
      audience,
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!email) return c.json({ error: "Unauthorized" }, 401);
    c.set("userEmail", email);
    c.set("sessionExpiresAt", typeof payload.exp === "number" ? payload.exp * 1000 : null);
  } catch (err) {
    console.warn("Access JWT rejected:", (err as Error).message);
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

/** Cheap CSRF guard on top of Access cookies: writes must come from this origin. */
export const sameOriginWrites = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("Origin");
    if (origin !== new URL(c.req.url).origin) {
      return c.json({ error: "Cross-origin write refused" }, 403);
    }
  }
  return next();
});
