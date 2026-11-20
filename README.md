# Personal Website

My personal website, built with Hugo, showcasing my work as an AWS & Terraform Automation Consultant.

🌐 Live: [https://roussev.dev](https://roussev.dev)

## Prerequisites

- Hugo v0.128.0 or later
- Git

## Local Development

```bash
git clone --recurse-submodules https://github.com/bogsi/website.git
cd website
hugo server -D
```

The site will be available at http://localhost:1313/. If you cloned without
`--recurse-submodules`, run `git submodule update --init` to fetch the theme.

## Building for Production

```bash
hugo --minify
```

The built site is written to `public/`.

## Deployment

The site is deployed with Cloudflare Pages. Every push to `main` triggers an
automatic production deployment, and branches get preview deployments.

## Structure

- `hugo.toml`: site configuration
- `content/`: site content (about, services, projects, posts, inquiry pages)
- `layouts/`: template overrides for the theme
- `themes/terminal/`: the [Terminal](https://github.com/panr/hugo-theme-terminal) theme (git submodule)
- `assets/css/`: stylesheets processed by Hugo Pipes
- `static/`: files copied verbatim (security headers, downloads, standalone tools)
- `functions/api/order.js`: Cloudflare Pages Function behind the inquiry form

## CostLens cost audit service

`content/services/cost-audit.md` provides `/services/cost-audit/`, which is
listed on the Services page and offered as an option in the inquiry form. The
page's inquiry link preselects CostLens without submitting the form.

Reviewed public client downloads live in `static/downloads/costlens/`: the kit
ZIP and read-only CloudFormation template. Their bytes were verified against
the signed private CostLens v0.1.0 release; the ZIP includes only client guide,
authorization template, optional MCP guide and onboarding template. No private
CLI wheel, workspace or signing key is exported. Refresh both downloads from
a verified release when onboarding materials change.

Contact: `bogomil.roussev@gmail.com`.

## License

All rights reserved. © Bogomil Roussev
