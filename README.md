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
