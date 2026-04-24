import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { env } from "../lib/env";
import { addActivity, dynamo, PutCommand, updateListingStatus } from "../lib/db";
import { json, parseBody } from "../lib/http";
import { verifySignature } from "../lib/signing";
import type { ActivityType, MarketplaceEvent } from "../lib/types";

const statusByEventType: Partial<Record<MarketplaceEvent["type"], "published" | "sold">> = {
  publish_succeeded: "published",
  item_sold: "sold"
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = event.body ?? "";
    const signature = event.headers["x-marketplace-signature"] ?? event.headers["X-Marketplace-Signature"];

    if (!verifySignature(body, signature, env.webhookSecret)) {
      return json(401, { error: "Invalid marketplace signature" });
    }

    const payload = parseBody<MarketplaceEvent>(body);
    if (!payload.eventId || !payload.listingId || !payload.type || !payload.message) {
      return json(400, { error: "eventId, listingId, type, and message are required" });
    }

    try {
      await dynamo.send(new PutCommand({
        TableName: env.webhookEventsTable,
        Item: {
          eventId: payload.eventId,
          listingId: payload.listingId,
          receivedAt: new Date().toISOString()
        },
        ConditionExpression: "attribute_not_exists(eventId)"
      }));
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        return json(200, { duplicate: true });
      }
      throw error;
    }

    const activityType = payload.type as ActivityType;
    await addActivity({
      listingId: payload.listingId,
      type: activityType,
      message: payload.message,
      marketplaceEventId: payload.eventId,
      rawPayload: payload
    });

    const status = statusByEventType[payload.type];
    if (status) {
      await updateListingStatus({
        listingId: payload.listingId,
        status,
        marketplaceListingId: payload.marketplaceListingId
      });
    }

    return json(200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Unable to ingest webhook" });
  }
};
