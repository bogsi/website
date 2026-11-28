# roussev.dev brand

The design system for roussev.dev and the admin dashboard. Use these files and
values instead of inventing new ones.

## Logo

| File | Use |
|------|-----|
| `static/brand/mark.svg` | The "R" mark on its own. Transparent inside, so it works on dark and light backgrounds. Use it wherever the logo appears without text. |
| `static/favicon.svg` | The mark on a rounded near-black square. Browser tab icon. |
| `static/favicon.png`, `static/favicon.ico` | 48 px PNG and 16/32/48 px ICO fallbacks for browsers that don't support SVG icons. |
| `static/apple-touch-icon.png` | 180 px icon for iOS home screens. |
| `static/brand/wordmark-dark.svg` | Mark + "roussev.dev" on a dark background. For documents, slides and profile banners. |
| `static/brand/wordmark-light.svg` | The same lockup on a white background. |

Rules:

- Keep clear space around the mark of at least a quarter of its height.
- The smallest size for the mark is 16 px. Below 24 px, use `favicon.svg`, whose
  dark square keeps it readable.
- Don't recolor, stretch, rotate, add shadows or outline the mark.
- On the website, the header shows the mark as inline SVG next to the name set
  in the site font, rather than embedding the wordmark files. The wordmark SVGs
  set their text in Inter with an Arial fallback, and the site does not load
  Inter.

The PNG and ICO icons are generated from `static/favicon.svg`. To regenerate them:

```bash
rsvg-convert -w 48 static/favicon.svg -o static/favicon.png
rsvg-convert -w 180 -b '#0B0F14' static/favicon.svg -o static/apple-touch-icon.png
convert static/favicon.png -define icon:auto-resize=48,32,16 static/favicon.ico
```

## Colors

The brand has three colors. Everything else is derived from them.

| Name | Hex | Role |
|------|-----|------|
| Teal | `#14B8A6` | Accent: links, buttons, highlights, the mark |
| Near-black | `#0B0F14` | Page background, text on teal |
| White | `#FFFFFF` | Headings and strong text |

Supporting colors for interface text and surfaces:

| Name | Hex | Role | Contrast on near-black |
|------|-----|------|-------------------------|
| Surface | `#111821` | Cards, code blocks, panels | n/a |
| Border | `#263241` | Dividers and input borders | n/a (decorative) |
| Text | `#CBD5E1` | Body text | 12.9:1 |
| Muted | `#8B96A3` | Secondary text, captions | 6.4:1 |
| Danger | `#F87171` | Form errors | 7.0:1 |

Accessibility (WCAG 2.2, AA needs 4.5:1 for body text):

- Teal on near-black: 7.7:1, passes AA and AAA.
- Near-black text on a teal button: 7.7:1, passes.
- **White text on teal: 2.5:1, fails.** Buttons with a teal background must use
  near-black text.
- **Teal text on white: 2.5:1, fails.** Teal is for dark backgrounds. On a white
  background, use it only for the mark or for large decorative elements, not
  for text.

## Typography

The site uses one typeface, Fira Code, loaded from `cdn.staticdelivr.com`
(allowed by the CSP in `static/_headers`). The brand kit does not define a
typeface, so this is unchanged. Changing it means updating the CSP as well.
