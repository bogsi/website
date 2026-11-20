---
title: "AWS Cost Audit"
description: "A read-only AWS cost audit with a ranked report, evidence, data gaps, and remediation examples"
draft: true
---

<!-- DRAFT: do not publish until the owner confirms the service name, pilot outcome, distribution terms, contact link, supported client scope and release download URLs (see anomaly_explorer docs/service-offering.md, T098/T080). -->

CostLens helps your team understand AWS spending, investigate growth, and review possible savings. A roussev.dev consultant runs a read-only audit and delivers a ranked report with evidence, data gaps, and remediation examples your team can review before changing anything.

## Engagement process

1. Agree the account scope, authorization period and Cost Explorer request costs.
2. Review the client kit and deploy the read-only role using the provided CloudFormation link or downloaded template. Send the role ARN to the consultant.
3. The consultant verifies access, runs the audit and discusses findings with you.
4. Receive the report with scan ID, CostLens and catalogue versions, assumptions, and Terraform/OpenTofu or CLI examples where applicable. Savings are estimates; missing data is identified in the report.
5. Your team decides which changes to apply. Delete the role stack at engagement end; local engagement data is purged within 30 days unless your terms differ.

## Client kit and data handling

The release kit contains the permission guide, written authorization record, CloudFormation template and optional local MCP guidance.

Audits run on an encrypted consultant workstation with owner-only local files. Temporary AWS credentials and raw API responses are not stored. Report copies and backups follow agreed retention terms. Optional AI host/provider access requires separate written client approval.

## Contact

Contact details are provided on the [Services](/services/) page.
