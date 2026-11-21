+++
title = "The NAT Gateway bill nobody budgets for"
date = "2026-09-16"
author = "Bogomil Roussev"
cover = ""
description = "NAT Gateways quietly bill for every byte they process. Here is how I track down the traffic driving the charge and move most of it onto free VPC endpoints."
keywords = ["AWS", "NAT Gateway", "VPC Endpoints", "Cost Optimization", "Data Transfer", "Networking"]
+++

Most people know a NAT Gateway costs a few cents an hour and leave it at that. The hourly fee is the part everyone budgets for, and it's almost never the part that hurts. It's the other line, the data processing charge, that tends to show up as a surprise.

Here's the thing that catches teams out: a NAT Gateway bills roughly $0.045 for every gigabyte it moves, in *addition* to the hourly rate. Both directions. So the moment you push real traffic through it, the processing fee dwarfs the ~$32/month you were expecting. I've seen a single gateway run past $700 in a month, and the owner had no idea it was even possible for that number to move.

## Where the traffic usually comes from

Nine times out of ten, it's one of a handful of culprits, and the biggest offender by far is S3.

If your private instances are reading from or writing to S3 and you haven't set up a gateway endpoint, every byte of that is going out through the NAT Gateway and getting billed on the way. A backup job, a log shipper, something pulling training data — it adds up fast and it's completely avoidable. An S3 gateway endpoint is free. There is no reason to pay a NAT to carry S3 traffic.

After S3, the usual suspects:

- Instances pulling packages constantly. If your AMIs run `yum update` or `npm install` on boot and you're cycling instances a lot, each one is dragging hundreds of megabytes through the gateway.
- The CloudWatch agent shipping metrics and logs, when there's no interface endpoint for it.
- Container images. Pulling from a public registry through NAT, repeatedly, across an autoscaling group, is more expensive than it has any right to be.

None of these are dramatic on their own. That's exactly why they slip past — no single thing looks wrong, the bill just drifts up a bit each month until someone asks why networking costs more than the compute it supports.

## Finding out what's actually going through it

Before you change anything, you want to know where the bytes are going. In Cost Explorer, filter to the **EC2-Other** service and look for the `NatGateway-Bytes` usage type. That tells you how much you're processing, but not what's in it.

For the *what*, turn on VPC Flow Logs on the subnets routing through the gateway, send them somewhere you can query, and look at the destination addresses. S3 and other AWS service traffic will resolve to AWS IP ranges, and you'll usually spot the pattern quickly — one prefix, or one port, carrying most of the volume. That's your target.

If you'd rather not stand up flow log analysis, a rougher shortcut is to look at which subnets are the chattiest and work backwards from what's running in them. It's less precise but it's often enough to tell you whether you're looking at an S3 problem or a package-management problem.

## The fix is mostly endpoints

For S3 and DynamoDB, create gateway endpoints. They cost nothing, and they take traffic for those services off the NAT path entirely:

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc1234 \
  --service-name com.amazonaws.eu-west-1.s3 \
  --route-table-ids rtb-0def5678
```

For the other services — CloudWatch, ECR, SSM, Secrets Manager, and so on — you want interface endpoints. Those do carry a small hourly cost plus a per-GB rate, so they're not free, but the per-GB rate is meaningfully lower than NAT processing and you skip the gateway hop. If you're moving any serious volume to a service, the endpoint pays for itself.

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc1234 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.eu-west-1.monitoring \
  --subnet-ids subnet-0a1b2c3d \
  --security-group-ids sg-01234567
```

One caveat worth knowing: interface endpoints need DNS and a security group that actually allows traffic from your instances. If you create one and nothing seems to use it, that's almost always why. Check that private DNS is enabled on the endpoint and that port 443 is open from the right source.

The gateway itself can usually stay — you still need it for genuinely external traffic, the odd third-party API, OS updates from outside AWS. The goal isn't to delete the NAT, it's to stop paying it to do work a free endpoint can do.

## Worth a look even if nothing looks wrong

If you've never audited this, it's one of the higher-leverage half-hours you can spend on an AWS account. The savings are immediate — endpoints take effect the moment the route table updates — and there's no real risk, since you're changing the path traffic takes, not what the traffic is.

This is one of a few recurring patterns I keep running into. I wrote up the broader set in [common AWS billing anomalies](/posts/common-aws-billing-anomalies/) if you want the wider view; the NAT Gateway one just happens to be the one people underestimate most.
