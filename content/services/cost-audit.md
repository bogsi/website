---
title: "AWS Cost Audit with CostLens"
description: "A read-only AWS cost audit with a ranked report, evidence, data gaps and remediation examples."
draft: true
service_summary: "Review AWS spending, investigate growth and assess possible savings with a consultant-led, read-only audit."
inquiry_service: "CostLens AWS Cost Audit"
---

<!-- T080 approved private CostLens 0.1.0 on 2026-11-20, including documented
validation limits. Keep this existing page in draft pending visual/owner review
of the public offering; CLI approval does not publish the service page. -->

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
