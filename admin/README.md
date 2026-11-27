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
- **Account**: who is signed in and until when, where notifications go, email delivery health with a "Retry now" button, and Sign out (Access logout).
- **Login page**: the provisioning script titles the Access login page "roussev.dev" (Cloudflare's default is the random team name) and applies the site's colours.

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
   - Homepage URL: `https://<team>.cloudflareaccess.com`
   - Create an **OAuth App**, not a GitHub App: Cloudflare Access documents and supports OAuth Apps for its GitHub login. Ignore GitHub's "consider a GitHub App" hint.
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

## Backups (weekly, encrypted)

`.github/workflows/d1-backup.yml` exports `roussev-orders` every Sunday (and
on demand: Actions → "D1 backup" → Run workflow), encrypts it with
[age](https://age-encryption.org) to the public key in
`admin/backup/recipients.txt` and keeps it as a 30-day artifact. Only the
offline private key (`roussev-backup.key`) can open it. D1 Time Travel (7 days
on Free) remains the first resort for recent mistakes.

Restore test (local, no Cloudflare changes):

```bash
# download the artifact from the run page and unzip it, then:
age -d -i roussev-backup.key -o restore.sql roussev-orders-YYYY-MM-DD.sql.age
sqlite3 restore.db < restore.sql
sqlite3 restore.db "SELECT COUNT(*) FROM orders; SELECT id FROM orders ORDER BY created_at DESC LIMIT 1;"
rm restore.sql restore.db   # the plaintext contains customer data
```

Real restore into D1: `npx wrangler d1 create roussev-restore`, then
`npx wrangler d1 execute roussev-restore --remote --file restore.sql`, check
it, and switch the `DB` binding only after that.

To rotate the key: generate a new pair with `age-keygen`, replace the line in
`recipients.txt`, keep the old private key until its last backup expires.

## Login page branding (manual, once)

The Access organizations API rejects automated changes (12062), so
`provision.ts` only reports whether this is set. In Zero Trust → Settings →
Custom pages → Login page: organization name `roussev.dev`, header
`roussev.dev · Control Room`, footer `Private admin area`, background
`#282c34`, text `#abb2bf`.

## Rotating the Resend key

Create a sending-only key for `roussev.dev` in Resend, then update it in both
places: the GitHub secret `RESEND_API_KEY` (run "Admin dashboard" with
`deploy`; the run checks the key with Resend first and fails if it is invalid)
and the Pages project variable `RESEND_API_KEY` (encrypted; retry the latest
production deployment). Delete the old key in Resend last. Keys are never
logged or shown after they are saved.

## Zone hardening (one-shot)

`.github/workflows/zone-hardening.yml` (run by hand) enables DNSSEC, sets safe
edge TLS settings (TLS 1.2 minimum, TLS 1.3, Always Use HTTPS, automatic HTTPS
rewrites), adds a Free-plan rate limit on `/api/order` (5 requests per 10 s per
IP) and two WAF custom rules (block PHP/WordPress/dotfile probes; `/api/order`
accepts POST only), optionally adds the Search Console TXT record, and prints
read-only reports of Access apps/policies and the email DNS records (SPF,
Resend DKIM and bounce MX, DMARC). It does not change the SSL/TLS encryption
mode or zone-level HSTS.

1. Create a temporary API token (My Profile → API Tokens → Custom token),
   TTL 1 day, zone `roussev.dev` only: **Zone Read**, **Zone Settings Edit**,
   **DNS Edit**, **Zone WAF Edit**.
2. Add it as the GitHub secret `CLOUDFLARE_ZONE_TOKEN`.
3. Run the workflow with `check`, read the report, then run it with `apply`.
4. Delete the token in Cloudflare and the secret in GitHub.

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
