---
title: "Production MCP Server for Your Internal API"
description: "A production MCP server that lets Claude and other AI agents use one internal system safely: your identity provider, your AWS, audit log. €4,500, 2 weeks."
draft: false
service_summary: "Give AI agents safe, audited access to one internal system through a production MCP server in your own AWS account. €4,500 fixed, about 2 weeks."
inquiry_service: "Production MCP Server"
---

Your team wants Claude, ChatGPT or an IDE agent to work with an internal
system: a ticketing API, an inventory database, a reporting service. A demo
MCP server takes an afternoon. One you can put in front of real users, with
real permissions, takes more: sign-in through your identity provider, tools
that can only do what each user is allowed to do, a record of every call, and
infrastructure your team can run.

That is the fixed-scope engagement: one internal system, connected properly,
in about two weeks.

[Discuss your system](/order/?service=Production%20MCP%20Server)
or email [bogomil.roussev@gmail.com](mailto:bogomil.roussev@gmail.com).

## What you get

- **An MCP server for one internal system** with 5–10 well-defined tools,
  written in TypeScript against the current MCP specification (stateless
  Streamable HTTP).
- **Sign-in through your identity provider:** OAuth 2.1 with Microsoft Entra
  ID, Okta, Amazon Cognito or another OIDC provider. Each tool has its own
  scope, so access follows your existing roles.
- **Least-privilege access to the system behind it:** the server holds only
  the credentials its tools need, stored in AWS Secrets Manager.
- **Deployment in your AWS account** with Terraform/OpenTofu, on ECS Fargate
  or Lambda (or as a Bedrock AgentCore Gateway target if you already use it).
- **An audit log** of every tool call: who, which tool, when and the result,
  in CloudWatch Logs under your retention rules.
- **A security review** of the tools and permissions, written down with any
  open risks.
- **Tests, CI and handover documentation** so your team can change and run it
  without me.

## How it works

1. **Scoping call (free).** We pick the system, the 5–10 tools and who should
   be able to use them.
2. **Written scope and acceptance criteria.** Tools, permissions, target AWS
   account and what "done" means, agreed before any work starts.
3. **Access.** Your team grants a least-privilege role in a non-production AWS
   account and a test identity in your identity provider. No shared passwords
   or long-lived keys.
4. **Build.** The server, the Terraform module, tests and CI, with a working
   preview you can try from your own MCP client during the first week.
5. **Security review and fixes.** Permissions, input validation and the audit
   log are checked against the agreed criteria.
6. **Handover.** Production deployment together with your team, a walkthrough
   and the documentation. Access is removed at the end.

## Price and timeline

**€4,500 fixed** for one system with up to 10 tools, delivered in about
**2 weeks** from the agreed start date.

Not included: changes to the internal system itself, additional systems
(quoted separately) and ongoing operation. AWS charges for running the server
are billed to your account; the expected cost is estimated during scoping.

## Security

- Users sign in through your identity provider; nobody gets a separate
  password.
- Tools are scoped per user and per action, and read-only by default. Write
  actions are added only where you ask for them.
- Your data stays in your AWS account. The server does not call any third-party
  service of mine.
- Every tool call is logged for audit.
- Responses from your system are returned as untrusted data, and write tools
  are kept separate from read tools, to limit the impact of prompt injection.
  The security review states what remains possible.

## FAQ

**Our API is old or has no documentation. Does that work?**
Usually yes. If it has an HTTP API or a database we can read, the scoping call
is where we find out. If it does not, I will say so before you pay anything.

**Which AI clients can use it?**
Any client that supports remote MCP servers with OAuth, such as Claude and
compatible IDE agents. Which clients your team uses is part of the scope.

**What does it cost to run on AWS?**
It depends on usage and on the option chosen (Lambda or ECS Fargate). The
estimate is part of the written scope.

**What happens after delivery?**
The code, infrastructure and documentation are yours. Follow-up work, such as
more tools or another system, is quoted separately.

## Start with a conversation

[Discuss your system](/order/?service=Production%20MCP%20Server).
We will agree the scope and acceptance criteria before any access is set up.
