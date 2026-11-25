# Control Room (admin.roussev.dev)

Private dashboard for inquiries from the roussev.dev order form. One Cloudflare
Worker serves the React SPA as static assets and a small Hono API under `/api`.
Orders live in D1 (`roussev-orders`). Cloudflare Access (GitHub login) guards
the hostname, and the API verifies the Access JWT again on every request.

Everything runs on free tiers: Workers Free, D1 Free, Zero Trust Free (≤ 50
users), Resend Free (100 emails/day).

```
admin/
├─ migrations/        D1 schema (orders, order_events)
├─ src/api/           Hono API: Access JWT check, orders, stats, status emails
├─ src/web/           SPA: overview, orders list, order detail
├─ src/shared/        statuses and types used by both
├─ scripts/           one-off Google Sheet import
└─ test/              vitest, D1 emulated with better-sqlite3
```

## What it does

- **Orders list** with status tabs, search (name, email, company, ID) and paging.
- **Order detail**: all fields, internal notes, timeline of status changes, notes and emails.
- **Status change emails the client every time** (one template per status, see `src/api/email.ts`).
  The result, sent or failed, is written to the timeline.
- **Overview**: new orders in the last 7 days, open inquiries, win rate, orders per month.

## Setup (once)

Do these in order. Steps 1–3 can be done before merging; nothing breaks
because the form keeps writing to the Google Sheet until the `DB` binding exists.

1. **Create the database**
   ```bash
   cd admin && npm ci
   npx wrangler login
   npx wrangler d1 create roussev-orders
   ```
   Put the printed `database_id` into `wrangler.jsonc`, then:
   ```bash
   npx wrangler d1 migrations apply roussev-orders --remote
   ```

2. **Cloudflare Access with GitHub login** (Zero Trust dashboard)
   - Settings → Authentication → Login methods → Add → GitHub (needs a GitHub OAuth app; the dashboard shows the callback URL).
   - Access → Applications → Add → Self-hosted. Domain `admin.roussev.dev`. Policy: Allow, Include → Emails → your GitHub email. Login methods: GitHub only.
   - Copy the **Application Audience (AUD) tag** and your **team domain** (`https://<team>.cloudflareaccess.com`) into `vars` in `wrangler.jsonc`. Also set `FROM_EMAIL` to the same sender the site uses.

3. **GitHub repository secrets** (Settings → Secrets and variables → Actions)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN` with: Account → Workers Scripts: Edit, D1: Edit; Zone (roussev.dev) → Workers Routes: Edit, DNS: Edit.

4. **Merge.** The `Admin dashboard` workflow tests, builds, applies migrations and deploys. The custom domain `admin.roussev.dev` is created on first deploy.

5. **Resend key for status emails**
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

6. **Point the order form at D1**: Pages project → Settings → Bindings → Add → D1 database, variable `DB`, database `roussev-orders`, **Production only** (so preview tests do not land in real data). Retry the latest production deployment.

7. **Import the Sheet**: Google Sheets → File → Download → CSV, then
   ```bash
   node scripts/import-sheet.mjs orders.csv > import.sql
   npx wrangler d1 execute roussev-orders --remote --file import.sql
   ```
   Safe to re-run: existing IDs are skipped. Unknown status values become `new`, with the original kept in notes.

8. **Pages build watch paths**: Pages project → Settings → Build → Build watch paths → Exclude `admin/*`, so dashboard changes do not rebuild the site.

9. After a week without problems, remove `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` and `GOOGLE_SPREADSHEET_ID` from the Pages project. While they exist, new orders are mirrored to the Sheet.

## Local development

```bash
cd admin
echo 'ACCESS_DEV_EMAIL=you@localhost' > .dev.vars   # bypasses Access on localhost only
npx wrangler d1 migrations apply roussev-orders --local
npm run build && npx wrangler dev                   # http://localhost:8787
npm test
```

`ACCESS_DEV_EMAIL` is ignored unless the request host is `localhost` or `127.0.0.1`, and `.dev.vars` is gitignored.
