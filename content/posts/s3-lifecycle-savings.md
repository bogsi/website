+++
title = "Getting S3 to stop charging you for data you forgot about"
date = "2026-10-07"
author = "Bogomil Roussev"
cover = ""
description = "Most S3 bills are storage nobody reads any more, sitting in the wrong class. A look at lifecycle rules, where they help, and the early-deletion trap to avoid."
keywords = ["AWS", "S3", "Lifecycle Policies", "Glacier", "Storage Classes", "Cost Optimization"]
+++

S3 is cheap enough per gigabyte that nobody thinks about it, which is precisely why it turns into one of the steadier line items on a long-running account. Data goes in and almost never comes out. Logs, exports, old backups, the output of some pipeline from two years ago that someone was afraid to delete. It all sits in Standard storage, fully priced, being read approximately never.

Lifecycle rules are the fix, and they're one of those features that feels like admin work until you see what the bucket's actually costing you.

## The idea, briefly

Every object in S3 sits in a storage class, and the classes trade retrieval speed and cost against storage price. Standard is instant and the most expensive to keep. Standard-IA (infrequent access) is a bit cheaper to store and charges you a small fee when you do read it. The Glacier tiers are cheaper still, down to almost nothing for Deep Archive, in exchange for retrieval that's slower and costs money.

A lifecycle rule is just an instruction that moves objects between those classes on a schedule, or deletes them after a while. You set it once per bucket (or per prefix) and S3 does the rest. The classic shape looks like this:

```json
{
  "Rules": [
    {
      "ID": "logs-cooldown",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 90,  "StorageClass": "GLACIER" }
      ],
      "Expiration": { "Days": 365 }
    }
  ]
}
```

Logs older than a month drop to IA, older than a quarter go to Glacier, and after a year they're gone. For most log data that matches how people actually use it: hot for a few weeks, occasionally referenced for a quarter, legally interesting for a year, irrelevant after that.

## Picking the thresholds without overthinking it

The honest answer is that the exact numbers matter less than having a rule at all. Standard to IA is roughly a 40-something percent cut on storage, and Glacier is another big step down from there, so almost any sensible transition schedule beats leaving everything in Standard forever.

That said, two things are worth getting right.

First, don't transition tiny objects. Each transition has a small per-object cost, and the smaller storage classes carry a minimum billable object size. If a prefix is full of kilobyte-sized files, moving millions of them to IA can cost more in transition requests and padding than you save on storage. Lifecycle rules let you filter on object size now — use it, or point your rules at prefixes you know hold larger files.

Second, think about how recent the data needs to stay instant. If a prefix gets queried in dashboards or served to users, Glacier will ruin someone's afternoon when a retrieval takes hours. Keep anything user-facing in Standard or IA.

If you genuinely can't predict the access pattern, Intelligent-Tiering exists for exactly that. It watches each object and moves it for you, for a small monitoring fee per object. I reach for it when a bucket's usage is a mystery and reach for explicit rules when it isn't.

## The trap that bites people

Here's the one that surprises almost everyone: early deletion fees.

The archival classes have a minimum storage duration. Glacier is 90 days, Deep Archive is 180. If you move an object to Glacier and then delete it — or let a short expiration rule delete it — before that minimum is up, you're billed as though it stayed the full period. So a lifecycle policy that transitions to Glacier on day 30 and expires on day 60 is quietly paying Glacier's 90-day minimum on every object, which defeats the point.

The symptom shows up in Cost Explorer as an `EarlyDelete` usage type. If you see it, your transition and expiration days are fighting each other. The fix is to make sure anything you send to an archive tier lives there at least as long as the minimum before you delete it.

## Finding the buckets worth bothering with

You don't need to lifecycle every bucket, just the ones holding real weight. S3 Storage Lens gives you a free account-wide view of where your bytes and your money are, broken down by bucket and by storage class. Sort by cost, and the handful of buckets worth your time will be obvious. Usually it's two or three buckets carrying most of the spend, and all of it in Standard.

Set rules on those, leave the rest, and move on. It's not glamorous, but it's the kind of change that keeps paying every month without anyone having to think about it again — which is the best sort of cost work there is.

If storage is the slow leak on your account, it's rarely the only one. I put together a wider rundown of the [AWS billing anomalies I keep running into](/posts/common-aws-billing-anomalies/), and forgotten storage sits near the top of it.
