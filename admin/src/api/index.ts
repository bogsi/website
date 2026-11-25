import { Hono } from "hono";
import { requireAccess, sameOriginWrites } from "./access";
import type { AppEnv } from "./env";
import { orders } from "./orders";

const api = new Hono<AppEnv>()
  .use("*", requireAccess)
  .use("*", sameOriginWrites)
  .get("/me", (c) => c.json({ email: c.get("userEmail") }))
  .route("/", orders);

export const app = new Hono<AppEnv>()
  .route("/api", api)
  .notFound((c) => c.json({ error: "Not found" }, 404))
  .onError((err, c) => {
    console.error(err);
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
} satisfies ExportedHandler<AppEnv["Bindings"]>;
