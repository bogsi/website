+++
title = "Common AWS Billing Anomalies: How to Spot, Understand, and Fix Unexpected Charges"
date = "2026-06-07"
author = "Bogomil Roussev"
cover = ""
description = "A breakdown of the most frequent AWS billing anomalies — data transfer, NAT Gateways, orphaned resources, and more — with practical steps to detect and prevent unexpected charges."
keywords = ["AWS", "Billing", "Cost Optimization", "FinOps", "NAT Gateway", "Cost Explorer", "Cloud"]
+++

> **The problem is rarely that AWS is wrong — it's that we didn't know what we were running.**

Cloud billing surprises are one of the most common pain points for engineering teams at every scale. A misconfigured NAT Gateway, a forgotten RDS snapshot, or a spike in data transfer can turn a predictable $800/month bill into a $4,200 shock overnight. This post breaks down the most frequent AWS billing anomalies, explains *why* they happen, and gives you actionable steps to detect and prevent them.

---

## Table of Contents

1. [Why AWS Bills Are Hard to Predict](#1-why-aws-bills-are-hard-to-predict)
2. [Data Transfer Charges](#2-data-transfer-charges)
3. [NAT Gateway Overuse](#3-nat-gateway-overuse)
4. [Forgotten or Orphaned Resources](#4-forgotten-or-orphaned-resources)
5. [EC2 Instance Right-Sizing Failures](#5-ec2-instance-right-sizing-failures)
6. [S3 Request and Storage Anomalies](#6-s3-request-and-storage-anomalies)
7. [RDS Snapshot and Storage Bloat](#7-rds-snapshot-and-storage-bloat)
8. [Lambda Cold Start and Invocation Spikes](#8-lambda-cold-start-and-invocation-spikes)
9. [CloudWatch Logs Retention Issues](#9-cloudwatch-logs-retention-issues)
10. [Cross-Region and Cross-Account Traffic](#10-cross-region-and-cross-account-traffic)
11. [Reserved Instance and Savings Plan Mismatches](#11-reserved-instance-and-savings-plan-mismatches)
12. [How to Set Up Billing Alerts and Cost Anomaly Detection](#12-how-to-set-up-billing-alerts-and-cost-anomaly-detection)
13. [A Practical Billing Audit Checklist](#13-a-practical-billing-audit-checklist)

---

## 1. Why AWS Bills Are Hard to Predict

AWS pricing is usage-based, region-specific, and composed of dozens of independently-billed dimensions per service. A single EC2 instance, for example, can generate charges across:

- Compute (instance hours)
- EBS storage (GB-month)
- EBS IOPS (if provisioned)
- Data transfer OUT
- Elastic IP (if unattached)
- CloudWatch metrics

Multiply this by 20+ services in a non-trivial architecture, and the surface area for billing surprises grows quickly.

**The three root causes of most billing anomalies:**

| Cause | Example |
|---|---|
| **Misconfiguration** | NAT Gateway processing traffic that should use VPC endpoints |
| **Forgotten resources** | Idle RDS instance running in a dev account for 3 months |
| **Usage spikes** | A bug causing Lambda to invoke itself in a loop |

Understanding which category your anomaly falls into is the first step to resolving it.

---

## 2. Data Transfer Charges

### What it is

AWS charges for data transferred *out* of AWS to the internet, and for data transferred *between* regions. Data transfer *into* AWS is generally free. Data transfer within the same region between services is usually free, but there are important exceptions.

### Why it spikes

- **EC2-to-EC2 traffic across Availability Zones** — even within the same region, cross-AZ traffic costs $0.01/GB each way. If your application is chatty between AZs (e.g., a database in us-east-1a talking to an app server in us-east-1b at high volume), this adds up fast.
- **Serving large files directly from EC2 or RDS** instead of using CloudFront.
- **Misconfigured replication** — a backup tool replicating data to a different region every hour.
- **Public NAT routing** for traffic that could stay within AWS via VPC endpoints.

### How to detect it

Navigate to **Cost Explorer → Service: EC2-Other → Usage Type Group: Data Transfer**. Look for line items labeled:

- `DataTransfer-Regional-Bytes` — cross-AZ
- `DataTransfer-Out-Bytes` — to internet
- `DataTransfer-Out-Bytes-Regions` — cross-region

### How to fix it

```
Checklist:
✅ Use VPC endpoints for S3, DynamoDB, and other AWS services
✅ Serve large assets via CloudFront (first TB/month free)
✅ Co-locate EC2 instances and databases in the same AZ for latency-sensitive workloads
✅ Review cross-region replication schedules
```

---

## 3. NAT Gateway Overuse

### What it is

A NAT Gateway allows private subnet resources to reach the internet. It charges on two dimensions:

- **Hourly fee**: ~$0.045/hour (~$32/month per gateway)
- **Data processing fee**: $0.045/GB processed — *every byte in and out*

### Why it's a common anomaly

The data processing fee is invisible until your architecture sends significant traffic through it. The most expensive mistake: routing **S3 traffic** through a NAT Gateway instead of using an S3 VPC endpoint.

**Example cost calculation:**

> 500 GB/day of EC2 → S3 traffic through NAT Gateway  
> = 500 GB × $0.045 × 30 days = **$675/month**  
> With an S3 VPC endpoint: **$0**

### Other NAT Gateway traps

- **Multiple NAT Gateways per AZ** (correct for HA, but teams sometimes create them and forget them)
- **CloudWatch agent** sending metrics through NAT instead of through the VPC endpoint for CloudWatch
- **Package installations** (yum, apt, npm install) on instances that run frequently — each install may download hundreds of MBs

### How to detect it

In Cost Explorer, filter by **Service: EC2-Other** and look for `NatGateway-Bytes`. Cross-reference with your VPC endpoint configuration.

### How to fix it

Create VPC endpoints for services your private instances use most:

```bash
# Create an S3 gateway endpoint (free)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxxxxxx \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-xxxxxxxx

# Create an interface endpoint for CloudWatch (has a small hourly cost, but cheaper than NAT processing)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxxxxxx \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-1.monitoring
```

---

## 4. Forgotten or Orphaned Resources

### What it is

Resources that were created for a task, test, or deployment — and never cleaned up. They quietly accrue charges month after month.

### The most common orphaned resources

| Resource | Typical cost | Why forgotten |
|---|---|---|
| Elastic IP (unattached) | ~$3.60/month each | Created for an instance that was terminated |
| Idle RDS instance | $50–$500/month | Spun up for a demo or staging, never terminated |
| Unused EBS volumes | $0.10/GB-month | EC2 instance terminated, volume left behind |
| Old EBS snapshots | $0.05/GB-month | Automated backups accumulating without a retention policy |
| Stopped EC2 instances | EBS still charged | Instance "stopped" but not terminated |
| Load balancers with no targets | ~$16/month + LCU | Application refactored, ALB left running |

### How to detect them

**AWS Trusted Advisor** (Business/Enterprise support) flags idle resources automatically. For free-tier accounts, you can use the following AWS CLI commands:

```bash
# Find unattached Elastic IPs
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].[PublicIp,AllocationId]' \
  --output table

# Find unattached EBS volumes
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].[VolumeId,Size,CreateTime]' \
  --output table

# Find stopped EC2 instances (still paying for EBS)
aws ec2 describe-instances \
  --filters Name=instance-state-name,Values=stopped \
  --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,LaunchTime]' \
  --output table
```

### How to prevent them

- **Tag all resources** with `Project`, `Environment`, and `Owner` tags at creation time — use AWS Config rules to enforce this
- **Use AWS Nuke** or **cloud-custodian** to automate cleanup of dev/test accounts on a schedule
- **Set up lifecycle policies** for EBS snapshots and S3 objects from day one
- **Review your bill monthly** with Cost Explorer grouped by tag

---

## 5. EC2 Instance Right-Sizing Failures

### What it is

Running EC2 instances that are significantly over-provisioned (too large) or running instances that should be Spot or Reserved instead of On-Demand.

### The scenarios

**Over-provisioned instances**: A `m5.4xlarge` running at 8% average CPU. AWS Compute Optimizer will flag this. Moving to an `m5.xlarge` might save 75% of that instance cost.

**On-Demand when Reserved makes sense**: If you have a production database that runs 24/7, an On-Demand `db.r6g.2xlarge` at ~$0.96/hr costs ~$6,912/year. A 1-year Reserved Instance for the same costs ~$4,300 — a **38% saving**.

**Missing Spot for fault-tolerant workloads**: Batch jobs, CI/CD workers, and ML training runs are ideal for Spot Instances, which can be 60–90% cheaper than On-Demand.

### How to detect it

1. **AWS Compute Optimizer** — navigate to EC2 instances, it shows rightsizing recommendations with projected savings
2. **Cost Explorer Rightsizing Recommendations** — found under "Rightsizing recommendations" in the left nav
3. **CloudWatch metrics** — look for instances with `CPUUtilization` consistently below 10%

### How to act on it

```
Decision framework:
- Consistent 24/7 workload, predictable size → Reserved Instance or Savings Plan
- Variable workload → On-Demand or Compute Savings Plan
- Fault-tolerant batch / stateless → Spot Instances
- Idle or over-sized → Rightsize or terminate
```

---

## 6. S3 Request and Storage Anomalies

### What it is

S3 charges for storage (GB-month), requests (PUT, GET, LIST, etc.), and data retrieval (for Glacier tiers). Anomalies usually come from unexpected request volumes or from storage tier mismatches.

### Common S3 billing surprises

**High LIST request costs from S3 Inventory alternatives**: Some third-party tools or custom scripts call `ListObjectsV2` repeatedly on large buckets. Each 1,000 requests costs $0.005 for LIST — modest per call, but a script running every minute on a bucket with millions of objects adds up.

**Glacier retrieval fees**: Objects archived to Glacier or Glacier Deep Archive are cheap to store ($0.004/GB-month) but expensive to retrieve urgently. Expedited retrieval from Glacier can cost $0.03/GB + $0.01 per request.

**Missing lifecycle policies**: Without lifecycle rules, objects in Standard storage never move to cheaper tiers, even if they haven't been accessed in 2 years.

**S3 Requester Pays misconfiguration**: If you intended to enable Requester Pays but configured it incorrectly, you may be paying for external access to your bucket.

### How to detect it

In Cost Explorer, filter by **Service: S3** and break down by **Usage Type**. Look for:

- `Requests-Tier1` and `Requests-Tier2` spikes
- `TimedStorage-ByteHrs` growing unexpectedly
- `EarlyDelete` charges (deleting objects before their minimum storage duration in Glacier)

### How to fix it

```json
// Example S3 lifecycle policy
{
  "Rules": [
    {
      "ID": "move-to-ia-then-glacier",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" }
      ],
      "Expiration": { "Days": 365 }
    }
  ]
}
```

---

## 7. RDS Snapshot and Storage Bloat

### What it is

RDS charges for database instance hours, storage (GB-month), I/O (for non-GP2/GP3 storage), and snapshots. Snapshots are incremental but can accumulate into significant storage over time.

### Why it happens

- **Automated backups** retained for 35 days (the maximum) when 7 days would suffice
- **Manual snapshots** that were never deleted — unlike automated backups, manual snapshots persist indefinitely even after the RDS instance is deleted
- **Storage autoscaling** enabled and triggered — RDS can increase storage automatically, but it *never decreases it automatically*. An instance that temporarily needed 500 GB will keep paying for 500 GB even after you clear the data.
- **Multi-AZ standby** — doubles your effective storage cost

### How to detect it

```bash
# List all manual RDS snapshots across all regions
aws rds describe-db-snapshots \
  --snapshot-type manual \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,DBInstanceIdentifier,SnapshotCreateTime,AllocatedStorage]' \
  --output table

# Check current storage allocation vs actual usage
aws rds describe-db-instances \
  --query 'DBInstances[*].[DBInstanceIdentifier,AllocatedStorage,DBInstanceClass]' \
  --output table
```

### How to fix it

- Set automated backup retention to **7 days** for most workloads (not 35)
- Delete manual snapshots older than your recovery time objective requires
- To reduce over-allocated storage, you'll need to **export data, create a new smaller instance, and import** — or use Aurora which handles storage more elastically
- Consider **Aurora Serverless v2** for dev/staging environments — it scales to zero when idle

---

## 8. Lambda Cold Start and Invocation Spikes

### What it is

Lambda is priced per invocation (first 1M free, then $0.20 per 1M) and per GB-second of compute. Anomalies usually come from:

1. **Runaway invocations** — a bug that causes one Lambda to trigger another in a loop
2. **Over-provisioned memory** — Lambda functions configured with 3,008 MB when they only need 256 MB
3. **Provisioned Concurrency charges** — forgotten provisioned concurrency on a function that's no longer latency-sensitive

### The recursive Lambda trap

This is one of the most dangerous billing anomalies. A common scenario:

```
S3 Upload → triggers Lambda A → Lambda A writes to S3 → triggers Lambda A again → ...
```

AWS now has **Lambda Recursive Loop Detection** that can stop this automatically, but it must be enabled and understood.

A single recursive Lambda loop has generated bills of tens of thousands of dollars in documented cases.

### How to detect it

- **CloudWatch Metrics**: Check `Invocations` and `Duration` for unusual spikes
- **Lambda Power Tuning** (open-source tool by AWS): Finds the optimal memory setting for cost/performance
- Check for **Lambda destinations** and **SQS/SNS/EventBridge** rules that might create feedback loops

### How to fix it

```bash
# Set a concurrency limit to cap blast radius
aws lambda put-function-concurrency \
  --function-name my-function \
  --reserved-concurrent-executions 100

# Check for recursive patterns
aws lambda get-function-recursion-config \
  --function-name my-function
```

Always set **reserved concurrency** limits on functions triggered by S3 events, SQS, or SNS — never leave them at unlimited.

---

## 9. CloudWatch Logs Retention Issues

### What it is

CloudWatch Logs storage costs $0.03/GB-month. Without a retention policy, log groups keep logs **forever**. In a production environment with detailed logging, this accumulates quickly and silently.

### Why teams miss it

- Each AWS service creates its own log group (API Gateway, Lambda, ECS, etc.)
- Log groups are created automatically and inherit no default retention policy
- The cost appears under `AmazonCloudWatch` in your bill, often overlooked compared to EC2 or RDS

### How to detect it

```bash
# Find all log groups with no retention policy set
aws logs describe-log-groups \
  --query 'logGroups[?retentionInDays==null].[logGroupName,storedBytes]' \
  --output table
```

### How to fix it

Set retention policies across all existing log groups. The following script applies a 30-day retention to all log groups with no policy:

```bash
aws logs describe-log-groups --query 'logGroups[?retentionInDays==null].logGroupName' \
  --output text | tr '\t' '\n' | while read group; do
    echo "Setting retention for: $group"
    aws logs put-retention-policy \
      --log-group-name "$group" \
      --retention-in-days 30
done
```

For new log groups, enforce retention via **AWS Config rule** or **CloudFormation/Terraform** templates that always include `RetentionInDays`.

---

## 10. Cross-Region and Cross-Account Traffic

### What it is

Traffic between AWS regions is billed at data transfer rates ($0.02–$0.09/GB depending on regions). This is separate from internet egress but equally easy to overlook.

### Where it hides

- **Multi-region active-active setups** with constant database replication
- **S3 Cross-Region Replication (CRR)** — the replication itself has a data transfer cost
- **AWS Organizations and centralized logging** — shipping logs from 10 regional accounts to a central security account
- **Latency-based routing** configurations that sometimes route unexpectedly

### Cost example

> 200 GB/day of S3 CRR from us-east-1 to eu-west-1  
> = 200 GB × $0.02 × 30 days = **$120/month** just for replication transfer  
> Plus S3 CRR request fees on top

### How to detect it

In Cost Explorer, filter by **Service: S3** or **EC2-Other** and look for **Usage Type** containing `Regions`. You can also enable **S3 Storage Lens** to see detailed cross-region activity.

### How to reduce it

- For S3 CRR, filter what gets replicated using prefix/tag rules — don't replicate everything
- Use **AWS PrivateLink** for cross-account service access to avoid internet egress
- Evaluate whether cross-region replication is actually required vs. cross-region backup (much lower frequency)

---

## 11. Reserved Instance and Savings Plan Mismatches

### What it is

Reserved Instances (RIs) and Savings Plans are commitments that provide discounts in exchange for consistent usage. Billing anomalies occur when the commitment doesn't match actual usage.

### Common mismatches

**Unused RIs**: You purchased a `m5.xlarge` RI for a service that was later migrated to containers. The RI charges continue for its term (1 or 3 years) with no offsetting usage discount.

**Savings Plan coverage gaps**: A Compute Savings Plan covers EC2, Lambda, and Fargate — but if your usage shifts heavily toward RDS, the Savings Plan provides no benefit and you're paying On-Demand for RDS.

**Zonal vs Regional RI confusion**: A Zonal RI only applies to a specific AZ. If your Auto Scaling group launches instances in a different AZ during a failover, those instances are billed On-Demand.

### How to monitor it

- **AWS Cost Explorer → Savings Plans → Utilization** — shows what % of your commitment is being used
- **Reserved Instance Utilization** report — same for RIs
- A utilization below 80% is a flag that your commitment is partially wasted

### How to optimize it

```
RI/Savings Plan strategy:
- Use Compute Savings Plans (most flexible) over EC2 Instance SPs
- Use Regional RIs over Zonal RIs for flexibility across AZs
- Purchase in smaller increments ($X/hour) rather than one large commitment
- Sell unused RIs on the AWS Marketplace if they are Standard (not Convertible)
- Review utilization monthly and convert Standard RIs to Convertible if usage patterns change
```

---

## 12. How to Set Up Billing Alerts and Cost Anomaly Detection

Proactive detection is always cheaper than reactive investigation. Here's the minimum setup every AWS account should have.

### Budget alerts

```bash
# Create a monthly budget with email alert at 80% and 100%
aws budgets create-budget \
  --account-id 123456789012 \
  --budget '{
    "BudgetName": "Monthly-Total-Budget",
    "BudgetLimit": { "Amount": "1000", "Unit": "USD" },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80
      },
      "Subscribers": [
        { "SubscriptionType": "EMAIL", "Address": "billing@yourcompany.com" }
      ]
    }
  ]'
```

### AWS Cost Anomaly Detection

This is an ML-powered service that learns your normal spending patterns and alerts you to unusual deviations. It's available at no cost (you only pay for the underlying Cost Explorer queries).

To set it up:

1. Go to **AWS Cost Management → Cost Anomaly Detection**
2. Create a **Monitor** (by service, account, or tag)
3. Create an **Alert subscription** with your email or SNS topic
4. Set a threshold (e.g., alert when anomaly > $50 or > 20% of expected)

### Service-level CloudWatch alarms

For specific services with usage spikes, create CloudWatch alarms:

```bash
# Alarm if Lambda invocations exceed 1M in an hour
aws cloudwatch put-metric-alarm \
  --alarm-name lambda-invocation-spike \
  --metric-name Invocations \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 3600 \
  --threshold 1000000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:billing-alerts
```

---

## 13. A Practical Billing Audit Checklist

Use this checklist during a monthly billing review or when investigating an unexpected charge.

### Monthly hygiene

- [ ] Review Cost Explorer month-over-month change by service
- [ ] Check Cost Anomaly Detection for flagged anomalies
- [ ] Verify budget alert thresholds are still appropriate
- [ ] Review Compute Optimizer recommendations

### Resource cleanup

- [ ] List and release unattached Elastic IPs
- [ ] Delete unused EBS volumes (status: available)
- [ ] Review and delete old RDS manual snapshots
- [ ] Check for idle Load Balancers (0 active connections for 7+ days)
- [ ] Review stopped EC2 instances — terminate or restart
- [ ] Check for Lambda functions with unused Provisioned Concurrency

### Configuration review

- [ ] Verify VPC endpoints exist for S3, DynamoDB, and CloudWatch
- [ ] Confirm all CloudWatch Log Groups have a retention policy
- [ ] Check S3 buckets for lifecycle policies
- [ ] Review NAT Gateway data processing (Cost Explorer: EC2-Other → NatGateway-Bytes)
- [ ] Verify RDS automated backup retention is ≤ 7 days (unless compliance requires more)

### Commitment health

- [ ] Check Savings Plan utilization (target: >85%)
- [ ] Check Reserved Instance utilization (target: >85%)
- [ ] Identify On-Demand spend that should be covered by commitments

---

## Conclusion

AWS billing anomalies are not random — they have patterns, and most of them repeat across teams and organizations. The good news is that the detection tools are built into the platform (Cost Explorer, Cost Anomaly Detection, Trusted Advisor, Compute Optimizer), and the fixes are usually straightforward once you know what to look for.

The single most impactful practice is not any specific technical fix — it's **treating billing as a first-class operational concern**: reviewing it monthly, setting up anomaly detection, and building cleanup habits into your team's workflow.

A $300 unexpected charge investigated and resolved quickly is a learning. The same issue ignored for six months is a $1,800 problem — and a harder conversation.

---

*Last updated: June 2026*  
*Services covered: EC2, S3, RDS, Lambda, CloudWatch, NAT Gateway, VPC, Savings Plans, Reserved Instances*  
*Author: roussev.dev*
