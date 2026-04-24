import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { env } from "../lib/env";
import { json, parseBody } from "../lib/http";
import { addActivity, dynamo, PutCommand } from "../lib/db";
import type { Listing } from "../lib/types";

const sqs = new SQSClient({});

interface CreateListingRequest {
  title?: string;
  description?: string;
  price?: number;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const input = parseBody<CreateListingRequest>(event.body ?? null);
    const title = input.title?.trim();
    const description = input.description?.trim();
    const price = Number(input.price);

    if (!title || !description || !Number.isFinite(price) || price <= 0) {
      return json(400, { error: "title, description, and positive price are required" });
    }

    const now = new Date().toISOString();
    const listing: Listing = {
      listingId: crypto.randomUUID(),
      sellerId: "demo-seller",
      title,
      description,
      priceCents: Math.round(price * 100),
      status: "publishing",
      marketplace: "ebay_mock",
      createdAt: now,
      updatedAt: now
    };

    await dynamo.send(new PutCommand({
      TableName: env.listingsTable,
      Item: listing,
      ConditionExpression: "attribute_not_exists(listingId)"
    }));

    await addActivity({
      listingId: listing.listingId,
      type: "listing_created",
      message: `Listing "${listing.title}" created.`
    });
    await addActivity({
      listingId: listing.listingId,
      type: "publish_started",
      message: "Publish job queued for eBay mock."
    });

    await sqs.send(new SendMessageCommand({
      QueueUrl: env.publishQueueUrl,
      MessageBody: JSON.stringify({
        listingId: listing.listingId,
        idempotencyKey: listing.listingId
      })
    }));

    return json(201, { listing });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Unable to create listing" });
  }
};
