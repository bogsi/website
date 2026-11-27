---
title: "AWS Architecture Review"
description: "A read-only review of one AWS account and its Cloudflare edge: findings ranked by risk and a 90-day plan. €1,800 fixed, delivered in 5 working days."
draft: false
service_summary: "A read-only review of one AWS account and its Cloudflare edge, with findings ranked by risk and a 90-day plan. €1,800 fixed, 5 working days."
inquiry_service: "AWS Architecture Review"
faq:
  - q: "Will you change anything in our account?"
    a: "No. The access is read-only for the whole review. Your team decides what to change, and when."
  - q: "We have more than one AWS account. Does it still fit?"
    a: "The fixed price covers one account, or one workload inside AWS Organizations. If you want more in scope, I quote it before we start, so the price is still fixed."
  - q: "Is this a security audit or a compliance check?"
    a: "Neither. Security is one of the areas I look at, but there is no penetration testing and no SOC 2 or ISO certificate at the end. If you need those, I will say so on the call."
  - q: "How is this different from the cost audit?"
    a: "The review looks at the whole setup and names the biggest cost items. The [cost audit](/services/cost-audit/) goes deep on spending only, with estimated savings per finding."
  - q: "Do we have to hire you for the fixes?"
    a: "No. The plan is written so your team can follow it on its own. If you want my help with some of it, that is a separate, fixed-price quote."
---

You have an AWS account that grew over a few years. Several people built
parts of it, some of it is in Terraform and some was clicked together, and
nobody is quite sure what would break first. Before you plan a migration, a
security push or a new hire, it helps to know what you actually have.

I look at one AWS account, and the Cloudflare zone in front of it if you use
one, with read-only access. You get a written review: what is there, what is
risky, what to fix first and what to leave alone. One price, agreed before I
get any access.

[Discuss your AWS setup](/order/?service=AWS%20Architecture%20Review)
or email me at [bogomil.roussev@gmail.com](mailto:bogomil.roussev@gmail.com).

## What you get

- **A map of what you run.** Accounts, VPCs, entry points, data stores and
  how changes reach production, on one diagram.
- **Findings ranked by risk.** For each one: what I saw, why it matters, how
  sure I am and roughly how much work the fix is.
- **What to fix first, and what to leave.** Not every finding is worth your
  time. I say which ones I would skip and why.
- **A 90-day plan.** The fixes in order, with an effort estimate for each, so
  your team can start the next week.
- **A 60-minute walkthrough.** We go through the review together, with
  whoever on your team will do the work.
- **Two weeks of questions.** After delivery, you can email me questions
  about the review and the plan.

The review comes as Markdown and PDF. The diagram is in a format you can
edit.

## What I look at

- **Identity and access.** The root user, IAM users with long-lived keys,
  roles that can do far more than they need, and who can reach production.
- **Network and edge.** What is open to the internet, security groups, TLS,
  and how Cloudflare or CloudFront sits in front of your services.
- **Data and backups.** Encryption, backups, and whether anyone has ever
  restored one.
- **Reliability.** Single points of failure, alarms that would wake someone
  up, and service quotas you are close to.
- **Delivery.** How much of the account is in Terraform/OpenTofu, how
  deployments happen, and drift between code and reality.
- **Cost.** The largest line items and anything obviously wasted. A full
  cost analysis is the [cost audit](/services/cost-audit/).

## Price and timeline

**€1,800 fixed** for one AWS account (or one workload in AWS Organizations),
up to three Regions, plus its Cloudflare zone. You get the review five working
days after the access works.

The price does not cover the fixes themselves, more accounts (quoted before we
start), penetration testing or compliance certification.

## How it works

1. **Free call.** You tell me what worries you about the setup. If a review
   is not what you need, I will say so.
2. **Written scope.** The account, Regions, what I may look at, how long the
   access lasts and how your data is handled.
3. **Access.** You create a role with two AWS managed read-only policies,
   `ViewOnlyAccess` and `SecurityAudit`, that only my account can assume, with
   an external ID. For Cloudflare, a read-only API token for the zone. Never
   send me AWS keys or passwords.
4. **Review.** I go through the account and, if you give me read access, your
   Terraform repositories.
5. **Walkthrough.** You get the review, and we go through it together.
6. **Access removed.** You delete the role and the token. The two weeks of
   questions start from delivery.

## Your data

I work on an encrypted workstation and keep only what the review needs: the
resource inventory and my notes. No secrets, no data from inside your
databases or buckets. I delete the engagement files within 30 days of
delivery unless we agree otherwise, and I do not send your data to an AI
provider without your written approval.

{{< faq >}}

## Next step

[Tell me about your AWS setup](/order/?service=AWS%20Architecture%20Review).
We agree the scope before you give me any access. If you would rather talk
first, book a free intro call.

{{< book-call id="architecture-review-book-call" >}}
