import { Hono } from "hono";
import { processPending } from "../../../lib/outbox.js";
import type { AppEnv } from "./env";
import { LAST_RUN_KEY, RETENTION_DAYS } from "./retention";

type Count = { status: "pending" | "failed"; count: number };

export const account = new Hono<AppEnv>()
  // Who is signed in, where notifications go, and email delivery health.
  .get("/account", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM email_outbox WHERE status IN ('pending', 'failed') GROUP BY status",
    ).all<Count>();
    const count = (s: Count["status"]) => results.find((r) => r.status === s)?.count ?? 0;
    const lastRun = await c.env.DB.prepare("SELECT value FROM app_meta WHERE key = ?")
      .bind(LAST_RUN_KEY)
      .first<{ value: string }>();
    return c.json({
      email: c.get("userEmail"),
      sessionExpiresAt: c.get("sessionExpiresAt"),
      notifications: { adminEmail: c.env.ADMIN_EMAIL ?? null, fromEmail: c.env.FROM_EMAIL ?? null },
      outbox: { pending: count("pending"), failed: count("failed") },
      retention: { days: RETENTION_DAYS, lastRunAt: lastRun ? Number(lastRun.value) : null },
    });
  })

  // Runs the hourly retry now, e.g. after fixing a Resend problem. Emails that
  // had given up ("failed") get a fresh set of attempts.
  .post("/outbox/retry", async (c) => {
    await c.env.DB.prepare("UPDATE email_outbox SET status = 'pending', attempts = 0 WHERE status = 'failed'").run();
    const result = await processPending(c.env.DB, c.env);
    return c.json(result);
  });
