+++
title = "A $9k/month AWS bill, and where a third of it was hiding"
date = "2026-11-11"
author = "Bogomil Roussev"
cover = ""
description = "An anonymised walkthrough of a CostLens audit on a mid-size SaaS account: what the $9k monthly bill was spent on, and the changes that took a third off it."
keywords = ["AWS", "Cost Audit", "CostLens", "Case Study", "Cost Optimization", "SaaS"]
+++

This is one engagement, anonymised, shared with the client's blessing. The numbers are rounded and a few details are blurred, but the shape of it is real — and it's representative enough that if you run a SaaS product on AWS, some of this will sound familiar.

The starting point: a bill sitting around $9,000 a month, climbing slowly, on an account that had grown organically over about four years. Nobody was alarmed. It wasn't a runaway, there'd been no incident. The founder just had the nagging sense that the number was higher than the product warranted and wanted someone to look properly before they either accepted it or committed to a Savings Plan on top of it.

That instinct — *look before you commit* — turned out to be the right one, because a good chunk of that spend shouldn't have been committed to at all.

## What the money was actually doing

The first job of an audit is boring and essential: find out where the money goes, not where people assume it goes. A read-only pass through Cost Explorer and the account's resources put the $9k into rough buckets:

- **Compute, around 45%.** EC2 and a couple of RDS instances. The real baseline of the product.
- **Data transfer and NAT, around 20%.** This was the surprise, and it's almost always the surprise.
- **Storage, around 20%.** S3 and EBS, including a lot that nothing was reading.
- **Everything else, around 15%.** CloudWatch, a load balancer or two, assorted managed services.

The useful finding wasn't the compute. Compute was mostly fair — a product has to run on something. The waste was concentrated in the two middle buckets, and that's typical. Teams watch their instance sizes because that's the number they understand. Nobody watches the plumbing.

## The three changes that moved the number

**NAT Gateway processing — the biggest single win.** The 20% going to data transfer and NAT was dominated by one thing: private instances reading from and writing to S3 through a NAT Gateway, because there was no gateway endpoint. Years of backup jobs, log shipping and asset handling, every byte billed on the way out. Adding an S3 gateway endpoint — which costs nothing — took that traffic off the NAT path entirely. This one change was worth a bit over $1,000 a month on its own.

**Forgotten storage.** The audit turned up the usual archaeology. Unattached EBS volumes from instances terminated long ago. Old RDS manual snapshots nobody would ever restore. A couple of buckets full of exports from a pipeline that had been switched off a year prior, all of it sitting in Standard storage at full price. Cleaning up the clearly-dead resources and putting lifecycle rules on the buckets that held real but cold data came to roughly $700 a month.

**Right-sizing two instances.** Compute Optimizer had been quietly flagging two over-provisioned instances for months — one running at single-digit CPU. Dropping them a size, after checking the memory headroom was genuinely there, saved around $400 a month without anyone noticing a performance change.

There were smaller items too — CloudWatch log groups with no retention policy keeping logs forever, an idle load balancer — but those three were the bulk of it.

## Where it landed

Added up, the changes took the bill from about $9,000 to roughly $6,000 a month. Call it a third. None of it touched the product's actual capacity; every saving came from waste, mistakes and defaults nobody had revisited, not from running the service leaner.

And *then* we talked about a Savings Plan. This is the part I care about most. If the client had bought a commitment at the $9k level first — which was the plan before the audit — they'd have locked in a year of paying for the NAT waste and the dead storage. Cutting the fat first meant the commitment got sized against the real, lean baseline. Doing it in that order was worth as much as any single fix.

## What's worth taking from this

The specifics will differ on your account, but the pattern rarely does. The savings weren't in the thing everyone was watching. They were in the plumbing — networking paths, forgotten storage, defaults left on — and they'd been accumulating quietly precisely because no single item was big enough to trip an alarm.

That's the whole case for looking properly at least once. A read-only audit can't break anything; the account access is read-only throughout and your team decides what, if anything, to change. The downside is a couple of hours of someone's attention. The upside, here, was a third of the bill and a much smarter commitment decision.

If you've got a bill you suspect is heavier than it should be, that's exactly the situation a [CostLens audit](/services/cost-audit/) is built for. And if you'd rather first get a feel for the kinds of things it tends to find, my rundown of [common AWS billing anomalies](/posts/common-aws-billing-anomalies/) is a good place to start.
