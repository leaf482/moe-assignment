# Approach

## Approach Summary

I chose an API-driven + message-driven hybrid architecture to clearly separate synchronous seller interactions from asynchronous marketplace integration. The seller-facing API stays simple: create a listing and read the aggregated feed. The marketplace publish path runs through a queue so transient failures, rate limits, retries, and idempotency can be handled without blocking the UI or duplicating external listings.

## Architecture

```text
Browser
  |
  v
CloudFront + S3 static frontend
  |
  v
API Gateway
  |
  +--> POST /listings --> Lambda --> DynamoDB Listings + Activity
  |                                      |
  |                                      v
  |                                    SQS Publish Queue + DLQ
  |                                      |
  |                                      v
  |                                Publisher Lambda
  |                                      |
  |                                      v
  |                              Mock Marketplace Lambda
  |                                      |
  |                               signed webhook
  |                                      |
  +--> POST /webhooks/marketplace --> Webhook Lambda --> DynamoDB Activity
  |
  +--> GET /listings --> Lambda --> DynamoDB Listings + Activity
```

- Frontend: S3 + CloudFront for cheap static hosting, HTTPS, and no always-on server.
- API: API Gateway + Lambda for pay-per-use request handling and simple deployment.
- Persistence: DynamoDB on-demand for low operational overhead and predictable prototype cost.
- Queue: SQS + DLQ for async publish retries and failure isolation.
- Publisher: Lambda worker that consumes publish jobs and calls the marketplace boundary.
- Mock marketplace: separate Lambda/API path so the boundary between "our system" and "the marketplace" remains explicit.
- Webhook receiver: Lambda endpoint that validates signed marketplace events and writes the aggregated activity feed.

## Reference Marketplace

<eBay>
In eBay flow, each seller authorizes access through OAuth, API calls are subject to marketplace quotas, and downstream sales/messages arrive through notification-style event delivery. Known pitfalls include token refresh, quota handling, duplicate publish attempts, listing validation differences, and webhook/event ordering. The prototype does not call real eBay APIs; the mock simulates the integration properties used in this slice: async publish, 15% synthetic rate-limit failure, idempotency keys, and signed webhook callbacks.

## Safety

- Idempotency: `listingId` is used as the publish idempotency key, and the mock marketplace stores the resulting `marketplaceListingId` so publish retries do not create duplicate external listings.
- Webhook deduplication: each marketplace event has an `eventId`; the webhook receiver conditionally writes it to DynamoDB and ignores duplicates.
- Retry strategy: publish jobs go through SQS, which retries transient marketplace failures and sends repeatedly failing jobs to a DLQ.
- Webhook validation: mock marketplace events are signed with an HMAC secret and verified before writing activity.
- Credential handling: no AWS keys or marketplace tokens are committed. The prototype injects its webhook secret through CDK-managed Lambda environment variables.
- Tenant scope: the prototype uses a single `demo-seller` so the data model and activity flow are visible without adding auth complexity; each listing still carries `sellerId`, which is where production reads/writes would be scoped for multi-tenant isolation.

## Cost

The stack is intentionally serverless: Lambda, API Gateway, DynamoDB on-demand, SQS, S3, and CloudFront. There is no NAT gateway, idle ECS service, Elastic IP, or provisioned database, and CloudWatch log retention is set to 7 days for the deployed prototype. For light evaluation traffic, runtime cost should usually be below `$0.25/day` and often only a few cents. At 10 sellers, 1k listings, and 10k events/month, I would expect low single-digit dollars/month in many accounts. The first cost wall is likely API Gateway request volume, CloudWatch log ingestion/retention, or a hot DynamoDB access pattern for a high-volume seller/listing.

## What I Cut / What I Would Build Next

Cut for the one-day prototype: real eBay OAuth/API calls, image upload, polished auth, rich marketplace schema mapping, event replay tooling, and a production-grade seller dashboard.

Next builds: Cognito or hosted auth, per-seller authorization checks, Secrets Manager or SSM token vaulting, encrypted per-tenant marketplace credentials, a real eBay sandbox adapter, per-marketplace adapter contracts, DLQ replay UI, CloudWatch alarms/dashboards, structured audit logs, and per-seller rate limiting.
