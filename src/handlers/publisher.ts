import type { SQSEvent } from "aws-lambda";
import { env } from "../lib/env";
import { addActivity, dynamo, QueryCommand, updateListingStatus } from "../lib/db";
import type { Listing } from "../lib/types";

interface PublishJob {
  listingId: string;
  idempotencyKey: string;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  if (!env.mockMarketplaceUrl) {
    throw new Error("MOCK_MARKETPLACE_URL is not configured");
  }

  for (const record of event.Records) {
    const job = JSON.parse(record.body) as PublishJob;
    const listingResult = await dynamo.send(new QueryCommand({
      TableName: env.listingsTable,
      KeyConditionExpression: "listingId = :listingId",
      ExpressionAttributeValues: {
        ":listingId": job.listingId
      },
      Limit: 1
    }));
    const listing = listingResult.Items?.[0] as Listing | undefined;

    if (!listing) {
      console.warn("Skipping publish for missing listing", job.listingId);
      continue;
    }

    const response = await fetch(env.mockMarketplaceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": job.idempotencyKey
      },
      body: JSON.stringify({
        listingId: listing.listingId,
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        sellerId: listing.sellerId
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      await addActivity({
        listingId: listing.listingId,
        type: "publish_failed",
        message: `Mock marketplace returned ${response.status}; SQS will retry.`
      });
      await updateListingStatus({ listingId: listing.listingId, status: "publish_failed" });
      throw new Error(`Marketplace publish failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    await updateListingStatus({
      listingId: listing.listingId,
      status: "published",
      marketplaceListingId: payload.marketplaceListingId
    });
  }
};
