import { Hono } from "hono";
import { processPending } from "../../../lib/outbox.js";
import { redact } from "../../../lib/redact.js";
import { requireAccess, sameOriginWrites } from "./access";
import type { AppEnv } from "./env";
import { account } from "./account";
import { securityHeaders } from "./headers";
import { orders } from "./orders";

const api = new Hono<AppEnv>()
  .use("*", requireAccess)
  .use("*", sameOriginWrites)
  .get("/me", (c) => c.json({ email: c.get("userEmail") }))
  .route("/", account)
  .route("/", orders);

export const app = new Hono<AppEnv>()
  .use("*", securityHeaders)
  .route("/api", api)
  .notFound((c) => c.json({ error: "Not found" }, 404))
  .onError((err, c) => {
    console.error(`${c.req.method} ${new URL(c.req.url).pathname}: ${redact(err)}`);
    return c.json({ error: "Internal error" }, 500);
  });

/** Typed client contract for the SPA (hono/client). */
export type AppType = typeof app;

// Static assets (the SPA) are served by Cloudflare without invoking this
// Worker; only /api/* runs code (see run_worker_first in wrangler.jsonc).
export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  // Hourly (see triggers in wrangler.jsonc): retry emails that failed, for
  // example while Resend's 100/day quota was used up (it resets 00:00 UTC).
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      processPending(env.DB, env).then((r) => {
        if (r.sent || r.failed) console.log(`Outbox retry: ${r.sent} sent, ${r.failed} failed`);
      }),
    );
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
