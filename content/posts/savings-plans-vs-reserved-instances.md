+++
title = "Savings Plans or Reserved Instances? How I actually decide"
date = "2026-10-28"
author = "Bogomil Roussev"
cover = ""
description = "Savings Plans and Reserved Instances both trade commitment for a discount, but they fail differently. How I choose between them and size one I won't regret."
keywords = ["AWS", "Savings Plans", "Reserved Instances", "Cost Optimization", "FinOps", "EC2"]
+++

Commitment discounts are the part of AWS cost work people put off, and I understand why. You're being asked to promise one or three years of spend to save money today, and the fear is obvious: commit to the wrong thing and you've locked in a bill for capacity you no longer use. That fear is legitimate. It's also the reason most accounts leave a lot of money on the table, paying full On-Demand rates for workloads that have run unchanged for years.

So here's how I actually think about it, having made the call on a fair few accounts now.

## What you're choosing between

Both Savings Plans and Reserved Instances give you a discount in exchange for committing. The difference is in what you're committing *to*.

A **Reserved Instance** commits you to a specific shape — roughly, a family, size and region. In return you get a strong discount on matching usage. It's precise, and precision cuts both ways: if your usage matches, great; if it drifts, the RI sits there applying to nothing.

A **Savings Plan** commits you to an *amount of spend per hour* rather than a specific instance. The Compute Savings Plan variant is the flexible one — it applies across EC2 regardless of family or region, and reaches Fargate and Lambda too. You give up a little discount compared to the most rigid RI, and in exchange you get coverage that follows your usage around as it changes.

That trade — a bit less discount for a lot more flexibility — is the whole decision in one sentence.

## My default, and when I break it

For most teams, I reach for a **Compute Savings Plan** first. Infrastructure changes. You migrate a service to a bigger instance family, you shift a workload to another region, you start containerising things. A Compute Savings Plan doesn't care about any of that; it keeps applying as long as you're spending at least your committed rate on eligible compute. It's the option least likely to strand you.

I break from that default in a couple of situations.

If a workload is genuinely fixed — a database that's going to be a `db.r6g.2xlarge` in one region for the next three years, and everyone agrees on that — a **Reserved Instance** squeezes out a bit more discount, and there's no flexibility being wasted because there was never going to be any change. RIs for RDS, ElastiCache and Redshift also matter because Savings Plans don't cover those services at all. If your spend is heavy on managed databases, that's RI territory whether you like it or not.

The other case is Spot. If a workload is fault-tolerant — batch jobs, CI runners, stateless processing, a lot of ML training — none of this applies and you should be on Spot, which is cheaper than any commitment discount and requires no commitment at all. Commitment discounts are for the steady baseline that has to be on anyway. Spot is for the elastic, interruptible layer on top.

## Sizing it so you don't regret it

The mistake that creates all those horror stories is committing to peak usage. You don't do that. You commit to your *floor* — the amount of compute that is on no matter what, the baseline that's been running every hour for months.

The way to find that floor is to look at the last few months of usage in Cost Explorer and find the level your spend never drops below. That's your safe commitment. Everything above it stays On-Demand (or Spot) and you top up the commitment later once you've watched it behave. Buying in smaller increments and adding to them beats one big confident commitment every time, because you can always buy more and you can never un-buy.

Then you watch two numbers. **Utilization** tells you how much of your commitment is being used — if it's under about 85%, you over-committed and you're wasting part of the discount. **Coverage** tells you how much of your eligible usage the commitment is catching — low coverage means there's more On-Demand you could profitably move under a plan. You want utilization high and coverage reasonable, and those two pull against each other, which is the point. The sweet spot is a commitment sized to the floor, fully used, with the variable part left uncommitted on top.

## A quick note on what already exists

Before buying anything, check what you've already got. Plenty of accounts are carrying RIs that were bought years ago for workloads that have since moved on, still billing, applying to nothing. Those are pure waste, and if they're Standard RIs rather than Convertible you may be able to sell them on the Reserved Instance Marketplace. It's worth a look before you layer new commitments on top of old ones nobody remembered.

None of this needs to be perfect. A commitment sized a little conservatively and reviewed every quarter will capture most of the available saving with almost none of the risk — and it beats the far more common alternative, which is paying On-Demand for everything because the decision felt too scary to make. If you want the broader context, I've written about the other [recurring AWS billing surprises](/posts/common-aws-billing-anomalies/) too, and mismatched commitments are one of them.
