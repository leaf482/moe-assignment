# Marketplace Aggregator Prototype

Minimal AWS prototype for creating a listing, publishing it to a mocked eBay marketplace, and aggregating marketplace events back into a seller activity feed.

Deployed demo:

- Frontend: `https://d6vlighwvblil.cloudfront.net`
- API: `https://931zrjrh7a.execute-api.us-west-2.amazonaws.com/prod/`

## Prerequisites

- Node.js 22+
- npm 10+
- AWS CLI v2 configured with credentials for the target AWS account
- AWS CDK bootstrap in the target account/region

This stack was deployed in `us-west-2`. Any standard AWS region that supports the services below should work.

## Deploy

From a clean clone:

```bash
npm install
npm run deploy
```

If the AWS account/region has not been bootstrapped for CDK yet:

```bash
npx cdk bootstrap
npm run deploy
```

For a named profile or explicit region:

```bash
AWS_PROFILE=my-profile AWS_REGION=us-west-2 AWS_DEFAULT_REGION=us-west-2 npm run deploy
```

The deploy output prints:

- `FrontendUrl` - CloudFront URL for the UI
- `ApiUrl` - API Gateway base URL
- `PublishDlqUrl` - SQS dead-letter queue for failed publish jobs

## Environment Variables

No application secrets need to be created manually for this prototype. CDK injects runtime configuration into Lambda environment variables:

- `LISTINGS_TABLE` - DynamoDB table for listing records
- `ACTIVITY_TABLE` - DynamoDB table for listing activity feed records
- `WEBHOOK_EVENTS_TABLE` - DynamoDB table used to deduplicate marketplace webhook events
- `MOCK_PUBLISH_TABLE` - DynamoDB table used by the mock marketplace for publish idempotency
- `PUBLISH_QUEUE_URL` - SQS queue URL for async publish jobs
- `WEBHOOK_SECRET` - HMAC secret used to sign and verify mock marketplace webhooks
- `MOCK_MARKETPLACE_URL` - mock marketplace publish endpoint used by the publisher Lambda
- `WEBHOOK_URL` - webhook receiver endpoint called by the mock marketplace

Useful local/deployment variables:

- `AWS_REGION` / `AWS_DEFAULT_REGION` - target region, for example `us-west-2`
- `AWS_PROFILE` - optional named AWS CLI profile
- `API_URL` - required only for `npm run smoke`; set it to the deployed `ApiUrl`
- `NODE_OPTIONS` - optional; on very small EC2 instances, `--max-old-space-size=3072` can avoid CDK Node heap OOM

## Use

Open `FrontendUrl`, create a listing, wait a few seconds, then refresh. The publish worker calls the mocked marketplace, which has a synthetic 15% rate-limit failure. SQS retries failed publish attempts and sends repeatedly failing jobs to the DLQ.

The UI has buttons to trigger mock `item_sold` and `new_comment` events for a listing. You can also trigger those events with curl. First set `API_URL` to the deployed `ApiUrl`, then use a `listingId` from a `POST /listings` response or from the browser network response:

```bash
export API_URL="https://931zrjrh7a.execute-api.us-west-2.amazonaws.com/prod/"

curl -X POST "$API_URL/mock-marketplace/events" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"LISTING_ID","type":"item_sold"}'
```

Supported mock event types:

- `item_sold`
- `new_comment`

Optional deployed smoke test:

```bash
API_URL="https://931zrjrh7a.execute-api.us-west-2.amazonaws.com/prod/" npm run smoke
```

## Tear Down

```bash
npm run destroy
```

The stack uses `RemovalPolicy.DESTROY` for prototype data stores and auto-deletes the frontend bucket objects. The deployed application does not require the EC2 instance used during development/deployment; that instance can be stopped after deployment.

## Estimated Cost Per Day

The runtime stack is serverless: CloudFront, S3, API Gateway, Lambda, DynamoDB on-demand, SQS, and CloudWatch Logs. There is no NAT Gateway, Elastic IP, always-on application server, or provisioned database. CloudWatch log retention is set to 7 days. For light evaluation traffic, the deployed stack should usually stay below `$0.25/day`, and will often be only a few cents/day.

Approximate daily cost drivers:

- CloudFront + S3 static frontend: cents or less at low traffic
- API Gateway: cents for hundreds or thousands of requests
- Lambda: near zero at prototype traffic
- DynamoDB on-demand: cents for small read/write volume
- SQS + DLQ: near zero
- CloudWatch Logs: cents, with 7-day retention configured for the prototype

At the assignment scale of roughly 10 sellers, 1k listings, and 10k events/month, this should remain low single-digit dollars/month. The first cost wall is likely API Gateway request volume, CloudWatch log ingestion/retention, or DynamoDB access patterns if a seller/listing becomes hot.

The EC2 instance used to deploy is not part of the runtime. The deployment host used here was a `t3.micro` with a 20 GiB EBS root volume and no Elastic IP. If stopped, compute charges stop, but the EBS root volume costs roughly `$0.05/day` while retained. Delete the deployment stack and terminate the EC2 instance when the evaluation is complete.
