# roussev.dev brand

The design system for roussev.dev and the admin dashboard. The logo files
and color values come from the brand pack (`roussev_dev_brand/`) and are used
as supplied: don't redraw the mark or add decoration to it.

## Logo files

| File | Use |
|------|-----|
| `static/brand/mark-transparent.svg` | Teal R mark, transparent background. The site header and footer use it. |
| `static/brand/mark-teal.svg` | Teal mark on a near-black square. Avatars, profile images. |
| `static/brand/mark-white.svg` | White mark on near-black. One-color use. |
| `static/brand/favicon.svg` | Simplified mark (no nodes) for small sizes, transparent. |
| `static/brand/favicon-dark.svg` | Simplified mark on near-black. Also served as `/favicon.svg`. |
| `static/brand/wordmark-dark.svg`, `wordmark-light.svg` | Horizontal lockups for documents and slides. Their text is set in Inter, so it renders correctly only where Inter is installed. |
| `static/favicon.png` (48 px), `static/favicon.ico` (16/32/48), `static/apple-touch-icon.png` (180 px), `static/brand/icon-512.png` | The pack's PNG favicons, flattened onto near-black so they stay visible on light browser tabs. |

Rules:

- Below 32 px use the favicon variant: the nodes of the full mark blur at
  that size.
- Keep clear space of at least a quarter of the mark's height around it.
- Don't recolor, stretch, rotate or outline the mark.
- On the site, the wordmark is HTML text in Inter next to the mark
  (`layouts/partials/logo.html`), not the wordmark SVG: text inside an
  `<img>` SVG can't use the page's web font.

## Colors

`assets/css/tokens.css` holds every value; components use the semantic names.

| Token | Value | Role | Contrast on `--bg` |
|-------|-------|------|--------------------|
| `--accent` | `#14B8A6` teal | Links, buttons, focus, small accents | 7.7:1 |
| `--accent-hover` | `#2DD4BF` | Hover on dark backgrounds | 10.3:1 |
| `--bg` | `#0B0F14` near-black | Page background, text on teal | n/a |
| `--surface` | `#111820` | Cards, code panels, footer | n/a |
| `--surface-raised` | `#17212B` | Hovered cards, service cards | n/a |
| `--border` | `#263341` | Dividers, card and input borders | decorative |
| `--text` | `#F8FAFC` | Headings, strong text | 18.4:1 |
| `--text-body` | `#CBD5E1` | Body copy | 12.9:1 |
| `--muted` | `#94A3B8` | Secondary text, meta | 7.5:1 |
| `--danger` | `#F87171` | Form errors | 7.0:1 |

The pack's `--brand-teal-hover` (`#0D9488`) is kept in `tokens.css` but not
used for hover on dark: it is darker than teal (5.1:1), so hover would read as
"disabled". `--accent-hover` is lighter instead.

Accessibility (WCAG 2.2 AA):

- Teal buttons use near-black text (7.7:1). **White on teal is 2.5:1 and fails.**
- **Teal text on white is 2.5:1 and fails.** On light backgrounds use teal
  only for the mark, never for text.
- Every interactive element has a visible `:focus-visible` outline in teal.

Use teal for emphasis and interaction, not for every heading or border.

## Typography

| Use | Font | Token |
|-----|------|-------|
| Interface and body | Inter (variable) | `--font-sans` |
| Code, terminal accents, labels | JetBrains Mono (variable) | `--font-mono` |

Both are self-hosted in `static/fonts/` (SIL Open Font License, licenses next
to the files), Latin subset only, so the CSP allows fonts from `'self'` only.
The type scale (`--fs-*`) and spacing (`--space-*`) are in `tokens.css`.

## Components

All in `assets/css/style.css`:

- **Header**: sticky, logo + navigation. The menu item that points at
  `params.cta.href` is shown as the call-to-action button. Below 760 px the
  links collapse behind a "Menu" button (`aria-expanded`, Escape closes).
- **Buttons**: `.button` (teal, the site's one call to action), `.button.outline`
  (secondary), `.text-link` (plain link with an arrow).
- **Cards**: `.situation` (home), `.service-card` and `.service-pane`
  (services), `.entry-card` (posts and projects, `partials/entry-card.html`).
- **Chips**: `.tool-list` (technologies), `.tag` (post tags), `.badges`
  (certifications from `data/badges.yaml`).
- **Code panels**: every fenced block, with a language label and a restrained
  Chroma color scheme.
- **Footer**: brand, site links, profiles, cookie settings.

Motion is limited to short hover and focus transitions, and is switched off
for `prefers-reduced-motion`.

## Voice

Supporting phrases from the brand pack: **Build · Automate · Scale · Ship**
and **Cloud · Platform · Infrastructure**. Use them sparingly (the footer and
the social image use them). Describe only real experience, projects and
credentials.

## Social image

`static/images/og-default.png` (1200×630) is rendered from
`docs/og-default.html`; the command is in that file.
