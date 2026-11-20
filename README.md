# Personal Website

This is my personal website built with Hugo, showcasing my work as an AWS & Terraform Automation Consultant.

## Prerequisites

- Hugo (v0.92.0 or later)
- Git

## Local Development

1. Clone this repository:
```bash
git clone https://github.com/bogsi/personal-website.git
cd personal-website
```











2. Start the Hugo development server:
```bash
hugo server -D
```

The site will be available at http://localhost:1313/

## Building for Production

To build the site for production:

```bash
hugo --minify
```

The built site will be in the `public` directory.

## Deployment

This site is deployed using Cloudflare Pages. Any push to the main branch will trigger an automatic deployment.

## Structure

- `content/`: Contains the site's content
- `themes/personal-theme/`: Custom theme for the site
- `static/`: Static assets (images, CSS, JavaScript)
- `config.toml`: Site configuration

## License

All rights reserved. © Bogomil Roussev

---

## 🚀 Live Website

🌐 [https://roussev.dev](https://roussev.dev)

---

## 📁 Project Structure

This is a [Next.js](https://nextjs.org/) project using the `/app` directory (App Router) and styled with [Tailwind CSS](https://tailwindcss.com/).

## CostLens cost audit service

The existing `content/services/cost-audit.md` provides `/services/cost-audit/`
using the Hugo Terminal theme. This publication PR sets `draft: false` so the
Cloudflare branch preview includes the page, Services listing and inquiry
option. Production changes only after owner review and merge to main.
The inquiry link preselects CostLens without submitting the form.

Reviewed public client downloads live in `static/downloads/costlens/`: the kit
ZIP and read-only CloudFormation template. Their bytes were verified against
the signed private CostLens v0.1.0 release; the ZIP includes only client guide,
authorization template, optional MCP guide and onboarding template. No private
CLI wheel, workspace or signing key is exported. Refresh both downloads from
a verified release when onboarding materials change.

T080 approved the scoped private release on 2026-11-20. Its final owner-review
condition for the public page is fulfilled by reviewing the branch preview
and approving this website PR before merge. Contact:
`bogomil.roussev@gmail.com`. The existing Cloudflare Pages integration deploys
main; no new hosting project or API is introduced. Local build: `hugo --minify`.
