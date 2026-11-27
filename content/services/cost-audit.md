---
title: "AWS Cost Audit with CostLens"
description: "Read-only AWS cost audit with a ranked savings report and remediation examples. Fixed-price tiers from €900, delivered in 1 to 10 working days."
draft: false
service_summary: "Review AWS spending, investigate growth and assess possible savings with a consultant-led, read-only audit. From €900, fixed price per engagement."
inquiry_service: "CostLens AWS Cost Audit"
---

<!-- Publishable preview prepared after the signed private CostLens 0.1.0
release. Production publication occurs only after owner review and merge of
this website PR; the public offering exposes client materials, not the CLI. -->

Understand your AWS spending and decide what to change. A roussev.dev consultant
runs a read-only CostLens audit and delivers a ranked report with evidence,
visible data gaps and remediation examples for your team to review.

[Discuss your AWS account](/order/?service=CostLens%20AWS%20Cost%20Audit)
or email [bogomil.roussev@gmail.com](mailto:bogomil.roussev@gmail.com).

## What you receive

- **Ranked findings:** potential savings, confidence and supporting observations.
- **A reviewable report:** Markdown, HTML and CSV deliverables with scan,
  CostLens and catalogue versions.
- **Practical next steps:** Terraform/OpenTofu or AWS CLI examples where
  available, with preconditions and caveats.
- **Visible limitations:** missing permissions, history and prices remain
  explicit. Savings are estimates, not guaranteed reductions in your bill.

## Pricing

| Tier | Typical account | Delivery | Price |
| --- | --- | --- | --- |
| **Quick Scan** | Up to about $5k/month AWS spend, 1 account | 1–2 working days | €900–1,500 |
| **Standard Audit** | $5k–30k/month, up to about 5 accounts | 3–5 working days | €2,000–3,500 |
| **Deep Audit** | $30k+/month, AWS Organizations, multi-account | 6–10 working days | from €4,500 |

The scoping call is free. After it you get a **fixed price** for your scope in
writing, before any access is set up. AWS Cost Explorer API requests made during
the audit are billed by AWS to your account; the exact
estimate is part of the agreed scope.

## How an engagement works

1. Agree the accounts, Regions, authorization period, data-handling terms and
   Cost Explorer request charges. Supported scope is confirmed per engagement.
2. Review the client kit and deploy the read-only CloudFormation role using the
   guide's quick-create link or the downloadable template. Share the role ARN
   through the agreed channel; never send AWS keys or passwords.
3. The consultant verifies access, runs the audit and discusses the findings.
4. Receive the report and remediation examples. Your team decides which changes
   to apply; CostLens does not apply them.
5. Delete the onboarding role stack to revoke access at engagement end.

## Review the client materials

- [Download the client kit](/downloads/costlens/costlens-client-kit.zip):
  permission guide, written authorization template, onboarding role template
  and optional local MCP guidance.
- [Download the CloudFormation template](/downloads/costlens/costlens-read-only-role.json)
  if you prefer to upload it yourself.

The guide's quick-create link uses the operator's verified S3-hosted template.
Downloading materials does not authorize an audit or grant AWS access.

## Access and data handling

Audits run on an encrypted consultant workstation with owner-only local files.
Temporary AWS credentials and raw API responses are not stored. Local engagement
data is purged within 30 days unless your terms differ. Delivered report copies
and backups follow agreed retention terms.

Optional AI host/provider access requires separate written approval. Account
access remains read-only throughout the audit; remediation examples require
your team's review before use.

## Start with a conversation

[Request a CostLens audit](/order/?service=CostLens%20AWS%20Cost%20Audit).
We will confirm your scope and access requirements before you deploy a role.
