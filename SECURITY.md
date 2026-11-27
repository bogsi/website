# Security policy

This repository is the source of [roussev.dev](https://roussev.dev): a Hugo
site with an order form (Cloudflare Pages Function) and a private admin
dashboard (`admin/`, a Cloudflare Worker behind Cloudflare Access). Only the
current `main` branch, which is what runs in production, receives fixes.

## Reporting a vulnerability

Please report it privately, not in a public issue:

- GitHub: **Security → Report a vulnerability** on this repository
  (private vulnerability reporting), or
- email `bogomil.roussev@gmail.com` (also listed in
  [`/.well-known/security.txt`](https://roussev.dev/.well-known/security.txt)).

Include what you found, how to reproduce it and the impact you expect. You
will get a reply within 5 working days. Please give a reasonable time to fix
the issue before you disclose it.

## Scope

In scope: `roussev.dev`, `admin.roussev.dev` and the code in this repository.

Out of scope: denial-of-service and volume testing, social engineering,
findings in third-party services (Cloudflare, Resend, GitHub) themselves, and
missing best-practice headers without a demonstrable impact.

Do not access, change or delete other people's data, and stop as soon as you
can show the issue. Test orders through the public form are fine; please mark
them clearly as a security test.
