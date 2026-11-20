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

## CostLens service draft

The existing `content/services/cost-audit.md` remains `draft: true` at
`/services/cost-audit/`. Preview it with `hugo server -D`. Normal `hugo --minify`
builds exclude the page, its generated Services listing and its inquiry option.
The inquiry link preselects the service without submitting the form.

Reviewed public client downloads live in `static/downloads/costlens/`: the kit
ZIP and read-only CloudFormation template. They were copied from the CostLens
0.1.0 candidate's client export; no private CLI wheel or workspace is included.
Static downloads are public build assets even while the service page is draft.
Refresh both from a reviewed CostLens package when onboarding materials change.

T080 approved private CostLens 0.1.0 on 2026-11-20. Before setting
`draft: false`, visually review this draft and confirm the public offering
(including branding, distribution and supported engagement scope). The owner-supplied
contact is `bogomil.roussev@gmail.com`. Production deployment follows the
existing Cloudflare Pages integration after merging the reviewed website PR.
