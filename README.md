# Marketplace Aggregator Prototype

Minimal AWS prototype for creating a listing, publishing it to a mocked eBay marketplace, and aggregating marketplace events back into a seller activity feed.

## Prerequisites

- Node.js 22+
- AWS CLI credentials configured for the target account
- CDK bootstrapped once per account/region: `npx cdk bootstrap`

## Deploy

```bash
npm install
npm run deploy
```

The deploy output prints:

- `FrontendUrl` - CloudFront URL for the UI
- `ApiUrl` - API Gateway base URL
- `PublishDlqUrl` - dead-letter queue for failed publish jobs

## Use

Open `FrontendUrl`, create a listing, wait a few seconds, then refresh. The publish worker calls the mocked marketplace, which has a synthetic 15% rate-limit failure. SQS retries failed publish attempts.

The UI also has buttons to trigger mock `item_sold` and `new_comment` events. These call:

```bash
curl -X POST "$API_URL/mock-marketplace/events" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"LISTING_ID","type":"item_sold"}'
```

Optional deployed smoke test:

```bash
API_URL="https://example.execute-api.us-east-1.amazonaws.com/prod/" npm run smoke
```

## Tear Down

```bash
npm run destroy
```

The stack uses `RemovalPolicy.DESTROY` for prototype data stores and auto-deletes the frontend bucket objects.

## Cost Notes

The stack uses Lambda, API Gateway, DynamoDB on-demand, SQS, S3, and CloudFront. For a one-day prototype at low traffic this should usually be under a few dollars, with CloudWatch log storage and request volume being the main variable costs.
