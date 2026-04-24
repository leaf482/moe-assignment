# Approach

This prototype uses an API-driven application boundary with a small message-driven publish path. Listing creation is synchronous from the seller's perspective, while marketplace publishing happens through SQS so transient third-party failures can be retried without blocking the UI.

```text
Browser -> CloudFront/S3 -> API Gateway -> Lambda -> DynamoDB
                                      |
                                      +-> SQS -> Publisher Lambda -> Mock Marketplace
                                                                  |
                                                                  +-> signed webhook -> Webhook Lambda -> Activity feed
```

Reference marketplace: eBay. The real integration would use OAuth seller consent, per-seller token storage, marketplace rate-limit aware queues, and idempotent publish keys. The mock keeps the same shape: publish endpoint, synthetic 15% rate-limit failures, idempotency key, and signed webhook callbacks.

Safety choices in the prototype include HMAC webhook verification, duplicate webhook event suppression, SQS retries with a DLQ, and DynamoDB conditional writes for idempotency-sensitive records. A production version would move secrets into Secrets Manager/SSM and add real seller auth; this prototype uses generated stack environment values and a demo seller.

Cost is intentionally serverless: no NAT gateway, no always-on compute, no provisioned database. At 10 sellers, 1k listings, and 10k events/month, expected cost should be low single-digit dollars in many accounts, with the first cost wall likely coming from API Gateway request volume, CloudWatch logs, or a hot DynamoDB access pattern.

What is cut: real eBay OAuth/API calls, image upload, polished auth, marketplace-specific schema mapping, and replay tooling. Next builds would be Cognito auth, Secrets Manager token vaulting, adapter contracts per marketplace, DLQ replay UI, CloudWatch alarms, and a real eBay sandbox adapter.
