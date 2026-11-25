# Control Room (admin.roussev.dev)

Private dashboard for inquiries from the roussev.dev order form. One Cloudflare
Worker serves the React SPA as static assets and a small Hono API under `/api`.
Orders live in D1 (`roussev-orders`). Cloudflare Access (GitHub login) guards
the hostname, and the API verifies the Access JWT again on every request.

Everything runs on free tiers: Workers Free, D1 Free, Zero Trust Free (≤ 50
users), Resend Free (100 emails/day).

```
admin/
├─ migrations/        D1 schema: orders, order_events, email_outbox
├─ src/api/           Hono API: Access JWT check, orders, stats, status emails, hourly retry cron
├─ src/web/           SPA: overview, orders list, order detail
├─ src/shared/        statuses and types used by both
├─ scripts/           provision.ts (setup + deploy), import-sheet.mjs (one-off)
└─ test/              vitest, D1 emulated with better-sqlite3
../lib/outbox.js      email outbox shared with the order form
```

## What it does

- **Orders list** with status tabs, search (name, email, company, ID) and paging.
- **Order detail**: all fields, internal notes, timeline of status changes, notes and emails.
- **Every status change emails the client** (one template per status, `src/api/email.ts`).
- **No lost emails**: every email is written to `email_outbox` in the same D1 batch as the order or status change, then sent. A failed send (Resend outage, or the 100/day quota that resets at 00:00 UTC) is retried by an hourly cron, up to 5 attempts. `orders.notify_status` shows pending, sent or failed.
- **Overview**: new orders in the last 7 days, open inquiries, win rate, orders per month.

## Setup: four manual steps, the rest is automatic

`scripts/provision.ts` creates or updates everything else on every deploy and
is safe to re-run: the D1 database and migrations, the Access GitHub login,
the Access policy and application for `admin.roussev.dev`, the Worker and its
custom domain, the Resend secret, the `DB` binding on the Pages project (plus
a redeploy of the site) and the `admin/*` build-watch exclusion.

1. **Zero Trust team.** If you have never opened Zero Trust: open
   <https://one.dash.cloudflare.com>, pick a team name and the Free plan.
   Your team domain is `https://<team>.cloudflareaccess.com`.

2. **GitHub OAuth App** (GitHub → Settings → Developer settings → OAuth Apps → New):
   - Homepage URL: `https://admin.roussev.dev`
   - Authorization callback URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Generate a client secret.

3. **Cloudflare API token** (My Profile → API Tokens → Create custom token):

   | Scope | Permission |
   | --- | --- |
   | Account | Workers Scripts: Edit |
   | Account | D1: Edit |
   | Account | Cloudflare Pages: Edit |
   | Account | Access: Apps and Policies: Edit |
   | Account | Access: Organizations, Identity Providers, and Groups: Edit |
   | Account | Account Settings: Read |
   | Zone `roussev.dev` | Workers Routes: Edit |
   | Zone `roussev.dev` | Zone: Read |

4. **GitHub repository secrets** (Settings → Secrets and variables → Actions):
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ACCESS_GITHUB_CLIENT_ID`,
   `ACCESS_GITHUB_CLIENT_SECRET`, `RESEND_API_KEY` (same key as the site).

Then run **Actions → Admin dashboard → Run workflow → deploy** (or merge to
`main`). Mode **check** is read-only and prints what exists, the team domain
and the exact callback URL for step 2.

Access is allowed for the `ADMIN_EMAIL` already set on the Pages project; it
must be the primary email of your GitHub account. To allow other addresses, set
the repository variable `ADMIN_ALLOWED_EMAILS` (comma-separated).
`FROM_EMAIL` is also read from the Pages project, so nothing is configured twice.

### Import the old Google Sheet (once)

Google Sheets → File → Download → CSV, then locally:

```bash
cd admin && npm ci
node scripts/import-sheet.mjs orders.csv > import.sql
npx wrangler login
npx wrangler d1 execute roussev-orders --remote --file import.sql
```

Safe to re-run: existing IDs are skipped. Unknown status values become `new`,
with the original kept in notes. Keep the CSV and `import.sql` out of Git: they
contain client data.

After a week without problems, remove `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY` and `GOOGLE_SPREADSHEET_ID` from the Pages project. While
they exist, new orders are also mirrored to the Sheet.

## Local development

```bash
cd admin
echo 'ACCESS_DEV_EMAIL=you@localhost' > .dev.vars   # bypasses Access on localhost only
npx wrangler d1 migrations apply roussev-orders --local
npm run build && npx wrangler dev                   # http://localhost:8787
npm test
```

`ACCESS_DEV_EMAIL` is ignored unless the request host is `localhost` or
`127.0.0.1`, and `.dev.vars` is gitignored.
