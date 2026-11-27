---
title: "Production MCP Server for Your Internal API"
description: "A production MCP server that lets Claude and other AI agents use one internal system safely: your identity provider, your AWS, audit log. €4,500, 2 weeks."
draft: false
service_summary: "Give AI agents safe, audited access to one internal system through a production MCP server in your own AWS account. €4,500 fixed, about 2 weeks."
inquiry_service: "Production MCP Server"
---

Your team wants Claude or an IDE agent to work with one of your internal
systems: a ticketing API, an inventory database, a reporting service. A demo
MCP server takes an afternoon. A server real users can rely on takes more.
People sign in through your identity provider, each tool can only do what that
user is allowed to do, every call is logged, and your team can run it after
I leave.

I build one of those for one system, in about two weeks, for a fixed price.

[Discuss your system](/order/?service=Production%20MCP%20Server)
or email me at [bogomil.roussev@gmail.com](mailto:bogomil.roussev@gmail.com).

## What you get

An MCP server with 5 to 10 tools for one internal system, written in
TypeScript against the current MCP specification (stateless Streamable HTTP).
Users sign in with OAuth 2.1 through Microsoft Entra ID, Okta, Amazon Cognito
or another OIDC provider. Each tool has its own scope, so access follows the
roles you already have.

The server holds only the credentials its tools need, in AWS Secrets Manager.
It runs in your AWS account on ECS Fargate or Lambda, deployed with
Terraform/OpenTofu. If you already use Bedrock AgentCore Gateway, it can sit
behind that instead. Every tool call is logged to CloudWatch Logs: who, which
tool, when and the result.

You also get a written security review with any risks that remain, tests, CI,
and documentation good enough for your team to change and run the server
without me.

## How it works

1. **Free call.** We pick the system, the tools and who may use them.
2. **Written scope.** Tools, permissions, the AWS account and what "done"
   means, agreed before I start.
3. **Access.** You give me a least-privilege role in a non-production AWS
   account and a test user in your identity provider. No shared passwords, no
   long-lived keys.
4. **Build.** In the first week you can already try a working preview from
   your own MCP client.
5. **Security review.** I check permissions, input validation and the audit
   log against what we agreed, and fix what comes up.
6. **Handover.** We deploy to production together, I walk your team through
   it, and my access is removed.

## Price and timeline

€4,500 fixed for one system with up to 10 tools, about two weeks from the
agreed start date.

The price does not cover changes to the internal system itself, more systems
(I quote those separately) or running the server afterwards. AWS bills the
running costs to your account; I estimate them during scoping.

## Security

Nobody gets a new password: users sign in through your identity provider.
Tools are read-only unless you ask for write actions, and each one is limited
to the user and the action. Your data stays in your AWS account, and the server
calls no service of mine.

Prompt injection cannot be ruled out completely. I return data from your system
as untrusted content and keep write tools apart from read tools, which limits
the damage. The security review says plainly what is still possible.

## FAQ

**Our API is old and undocumented. Will this work?**
Usually. If it has an HTTP API or a database I can read, we will find out on
the first call. If it does not, I will tell you before you pay anything.

**Which AI clients can use it?**
Any client that supports remote MCP servers with OAuth, such as Claude and
several IDE agents. We confirm yours during scoping.

**What does it cost to run on AWS?**
That depends on usage and on Lambda versus Fargate. You get the estimate with
the written scope.

**What happens after delivery?**
The code, the infrastructure and the documentation are yours. More tools or
another system are a new quote.

## Next step

[Tell me about your system](/order/?service=Production%20MCP%20Server).
We agree the scope before you give me any access.
