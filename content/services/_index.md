+++
title = "Services"
description = "AWS architecture reviews, cost audits and MCP servers at fixed prices, plus Terraform, CI/CD and ongoing help for teams on AWS, priced after a call."
faq = [
  { q = "What happens on the first call?", a = "You tell me what you are dealing with, and I ask questions. It is free. If I am not the right person for it, I will say so." },
  { q = "How do you price work?", a = "A fixed price for a written scope, agreed before any work or access. Published prices are on the [architecture review](/services/architecture-review/), [cost audit](/services/cost-audit/) and [MCP server](/services/mcp-server/) pages; other work is priced after the first call." },
  { q = "We already have infrastructure. Do you start from scratch?", a = "No. Almost every project starts from what you already run, and I change it step by step." },
  { q = "What happens after delivery?", a = "The code, infrastructure and documentation are yours. Follow-up work is quoted separately." },
]
+++

I work with teams on AWS. Three offers have a fixed, published price; the rest
I price after a free call, once I know what you run. If you are not sure where
to start, start with the architecture review.

```bash
$ ls -l services/
-rw-r--r--  arch-review       # fixed price, €1,800
-rw-r--r--  cost-audit        # fixed price, from €900
-rw-r--r--  mcp-server        # fixed price, €4,500
-rw-r--r--  terraform         # priced after a call
-rw-r--r--  ci-cd             # priced after a call
-rw-r--r--  ongoing-help      # monthly, agreed per team
```

## AWS architecture review

{{< service-pane card="services/architecture-review" >}}
You get:
  - A map of what you run, on one diagram
  - Findings ranked by risk, with effort to fix
  - What to fix first, and what to leave alone
  - A 90-day plan your team can follow
  - Walkthrough call and two weeks of questions
{{< /service-pane >}}

## AWS cost audit

{{< service-pane card="services/cost-audit" >}}
You get:
  - Ranked findings with estimated savings and confidence
  - Evidence and data gaps for every finding
  - Terraform or AWS CLI examples where they help
  - Read-only access, removed at the end
{{< /service-pane >}}

## MCP servers for internal APIs

{{< service-pane card="services/mcp-server" >}}
You get:
  - MCP server for one internal system (5-10 tools)
  - Sign-in through your identity provider (OAuth 2.1)
  - Terraform deployment in your AWS account
  - Audit log of every tool call
  - Security review and handover docs
{{< /service-pane >}}

## Terraform and OpenTofu

Infrastructure that was clicked together in the console, or Terraform that
nobody wants to touch. I bring it under modules your team can read and change:
state split by environment, CI that runs `plan` on every pull request, tests
for the modules, and a README for each one. Existing resources are imported,
not rebuilt. You can see how I write modules in my
[Terraform modules guide](/projects/terraform-modules-guide/).

## CI/CD pipelines

Mostly GitHub Actions, and GitLab CI or Jenkins when that is what you already
use. Builds, tests, security scans and deployments to AWS, with short-lived
credentials (OIDC) instead of stored keys, and actions pinned to exact
versions.

## Ongoing help

After a project, I can stay on for a few hours a month: reviewing pull
requests, checking costs, answering questions. Business hours, Sofia time
(EET), with an agreed response time. I do not offer 24/7 on-call; for that
you need a team, not one person.

{{< how-i-work >}}

{{< faq >}}

## Get in touch

Email me at [bogomil.roussev@gmail.com](mailto:bogomil.roussev@gmail.com),
call +359 878 880 112, or find me on
[LinkedIn](https://linkedin.com/in/bogomilroussev).

{{< cta href="/order/" id="services-footer-inquiry" >}}Discuss your project{{< /cta >}}
{{< book-call id="services-book-call" >}}
