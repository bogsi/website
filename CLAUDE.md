# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal/consulting site for roussev.dev: a **Hugo** static site on the `terminal` theme (git submodule at `themes/terminal`, from panr/hugo-theme-terminal), plus one **Cloudflare Pages Function** for the inquiry form. Deployed by Cloudflare Pages' Git integration: every push to `main` deploys production, and PR branches get preview deployments.

Site config is `hugo.toml`.

## Commands

```bash
git submodule update --init      # fetch the theme if themes/terminal is empty
hugo server -D                   # dev server at http://localhost:1313 (includes drafts)
hugo --minify                    # production build into public/ (gitignored)
```

The repo has no tests, linter or JS build. `package.json` is an npm stub. To verify a change, run `hugo --minify` and confirm it finishes with no errors, because template `errorf` calls are used as build-time assertions (see below).

## Architecture

- **Layouts override the theme.** Files in `layouts/` take precedence over `themes/terminal/layouts/`. `layouts/_default/baseof.html` and `layouts/partials/head.html` replace the theme's shell entirely. `head.html` inlines `assets/css/critical.css`, bundles `assets/css/style.css` through Hugo Pipes, and defines the orange accent CSS variables. Each section (`about`, `services`, `projects`, `posts`, `order`) has its own `list.html`.
- **Service pages drive several places through front matter.** A page in `content/services/` can set:
  - `service_summary`: rendered by `layouts/partials/service-card.html`. The `service-pane` shortcode (`layouts/shortcodes/service-pane.html`) embeds that card in a YAML-highlighted box on `content/services/_index.md`. Both **fail the build** (`errorf`) if the referenced page is missing (for example, still `draft: true` in a production build) or has no `service_summary`.
  - `inquiry_service`: automatically added as an `<option>` in the inquiry form (`layouts/order/list.html`). The form also preselects a service from `?service=<value>`, so links like `/order/?service=CostLens%20AWS%20Cost%20Audit` must match that value exactly.
- **Inquiry flow:** the form in `layouts/order/list.html` POSTs JSON to `/api/order`, which is handled by `functions/api/order.js` (Cloudflare Pages Functions file-based routing; there is no `_routes.json`, so Cloudflare generates routes automatically. If you add one, it must go in `static/` to be deployed, and it must keep `/api/*` included). The function drops submissions that fill the hidden `website` honeypot, verifies the Cloudflare Turnstile token server-side (`siteverify`; it must match action `order` and the request hostname, and the function fails closed with 503 if `TURNSTILE_SECRET_KEY` is unset), validates and length-limits the input, appends a row to Google Sheets using a service-account JWT signed with WebCrypto, then sends admin and customer emails through Resend in `waitUntil` with every visitor value HTML-escaped (an email failure is non-fatal). It returns `{success, orderId}`, and the form script then redirects to `/order/success/?id=ORD-…`. Environment variables are set in Cloudflare: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`, `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL`, `TURNSTILE_SECRET_KEY`. The public site key is `params.turnstileSiteKey` in `hugo.toml`; the build fails (`errorf`) while it is empty. The Turnstile widget needs `https://challenges.cloudflare.com` in `script-src` and `frame-src` of the CSP in `static/_headers`. CORS is pinned to `https://roussev.dev`, so the function can't be tested end to end from `hugo server`.
- **SEO plumbing:** `layouts/partials/head.html` emits the meta description (`.Description`, falling back to `params.description`) and `robots` `noindex` for tag/category pages and any page with `noindex: true` in its front matter. `<title>` is rendered only in `baseof.html`. `layouts/partials/structured-data.html` builds the JSON-LD graph: Person and ProfessionalService on every page (profile URLs come from `params.social`), BlogPosting for posts and projects, Service for service pages with `service_summary`, and BreadcrumbList. `layouts/_default/sitemap.xml` leaves out noindexed and taxonomy pages, and `layouts/robots.txt` adds the `Sitemap:` line. Give every new content page a `description` of 120–160 characters. `params.images` sets the default social preview (`static/images/og-default.png`, 1200×630) for Hugo's OpenGraph and Twitter templates, so a page's own `images` front matter overrides it. In `layouts/_default/single.html`, the byline links the author (falling back to `params.author`) to `/about/`, and `layouts/partials/article-cta.html` adds a CostLens/inquiry call to action to every post and project. Set `hide_cta: true` on an article that already ends with its own.
- **Security headers / CSP** live in `static/_headers`. The CSP only allows scripts from `'self'` plus inline scripts, styles/fonts from cdnjs (Font Awesome) and `cdn.staticdelivr.com` (Fira Code, the only web font), and fetches to `'self'` and `api.rss2json.com` (the Medium feed on the posts list). Any new external script, font or fetch target must be added there or it will be blocked in production.
- **Static downloads:** `static/downloads/costlens/` holds client-facing CostLens files (kit ZIP and a read-only IAM CloudFormation template). Per README, these are byte-verified copies from a signed private CostLens release. Refresh them only from a verified release. Never add the private CLI, workspace files or keys.
- `static/tools/dbm-mw-converter/` is a standalone HTML tool linked from the projects section.
- `archetypes/projects.md` is the front-matter template for `hugo new projects/<name>.md`.

## CI

`.github/workflows/` runs Claude Code: an automatic review on PRs (`claude-code-review.yml`) and `@claude` mentions (`claude.yml`). Neither workflow builds the site. Cloudflare Pages does the build.
