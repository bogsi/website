---
title: "AWS Cost Audit with CostLens"
description: "Read-only AWS cost audit with a ranked savings report and remediation examples. Fixed-price tiers from €900, delivered in 1 to 10 working days."
draft: false
service_summary: "Review AWS spending, investigate growth and assess possible savings with a consultant-led, read-only audit. From €900, fixed price per engagement."
inquiry_service: "CostLens AWS Cost Audit"
faq:
  - q: "Will you change anything in our AWS accounts?"
    a: "No. The role you deploy is read-only, and your team decides which changes to make. When the audit is over, you delete the role stack and my access is gone."
  - q: "Do you put our data into an AI tool?"
    a: "Not unless you approve it in writing first."
  - q: "What does the audit cost us on AWS?"
    a: "The audit makes a small number of Cost Explorer API requests, which AWS bills to your account. The estimate is part of the written scope."
  - q: "Do we need AWS Organizations?"
    a: "No. A Quick Scan covers one account. Organizations and many accounts are what the Deep Audit is for."
  - q: "What if there is not much to save?"
    a: "If your setup looks lean, I will say so on the first call, before you pay anything. Savings in the report are estimates, never a promise about your bill."
---

<!-- Publishable preview prepared after the signed private CostLens 0.1.0
release. Production publication occurs only after owner review and merge of
this website PR; the public offering exposes client materials, not the CLI. -->

Your AWS bill keeps growing and nobody can say exactly why. I look through
your accounts with read-only access, using CostLens, my own audit tool, and
give you a ranked list of what to change, how much each change could save and
how sure I am about it.

{{< cta id="cost-audit-top" service="CostLens AWS Cost Audit" />}}

Or email me at [bogomil.roussev@gmail.com](mailto:bogomil.roussev@gmail.com).

## What you get

A report in Markdown, HTML and CSV. Every finding shows the possible saving,
my confidence and the data behind it. Where it makes sense, I add a
Terraform/OpenTofu or AWS CLI example with the preconditions to check first.

The report also says what I could not see: missing permissions, short history,
prices I could not look up. Savings are estimates, not a promise about your
next bill.

## Pricing

| Tier | Typical account | Delivery | Price |
| --- | --- | --- | --- |
| **Quick Scan** | About $2k–5k/month AWS spend, 1 account | 1–2 working days | €900–1,500 |
| **Standard Audit** | $5k–30k/month, up to about 5 accounts | 3–5 working days | €2,000–3,500 |
| **Deep Audit** | $30k+/month, AWS Organizations, multi-account | 6–10 working days | from €4,500 |

If you spend less than about $2k a month, an audit rarely pays for itself.
AWS's own free cost tools are usually enough, and I will tell you that on the
call.

The first call is free. After it you get a fixed price in writing, before you
give me any access. The audit makes a small number of AWS Cost Explorer API
requests, which AWS bills to your account. I include the estimate in the scope.

## How it works

1. We agree the accounts, Regions, how long I may access them, how your data
   is handled and the expected Cost Explorer charges.
2. You deploy a read-only role from the client kit, with the quick-create link
   or the CloudFormation template, and send me the role ARN. Never send me AWS
   keys or passwords.
3. I check the access, run the audit and we go through the findings together.
4. You get the report. Your team decides what to change; I do not change
   anything in your accounts.
5. You delete the role stack, and my access is gone.

## Client materials

You can read everything before we talk: the
[client kit](/downloads/costlens/costlens-client-kit.zip) has the permission
guide, a written authorization template, the role template and optional local
MCP guidance. The
[CloudFormation template](/downloads/costlens/costlens-read-only-role.json) is
also available on its own if you prefer to upload it yourself. The guide's
quick-create link uses the same template, hosted in my verified S3 bucket.
Downloading the files does not give me any access.

## Your data

I run audits on an encrypted workstation, and engagement files are readable
only by me. Temporary AWS credentials and raw API responses are not stored.
I delete local engagement data within 30 days, unless we agree otherwise.
Report copies and backups follow the retention we agree on.

I do not send your data to an AI provider unless you approve it in writing
first. My access stays read-only for the whole audit.

{{< faq >}}

## Next step

Tell me about your AWS account. We agree the scope and access before you
deploy anything. If you would rather talk first, the inquiry page has a link
to book a free call.

{{< cta id="cost-audit-bottom" service="CostLens AWS Cost Audit" />}}
