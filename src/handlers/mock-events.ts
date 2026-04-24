import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { env } from "../lib/env";
import { dynamo, QueryCommand } from "../lib/db";
import { json, parseBody } from "../lib/http";
import { signBody } from "../lib/signing";
import type { Listing, MarketplaceEvent } from "../lib/types";

interface TriggerEventRequest {
  listingId?: string;
  type?: "item_sold" | "new_comment";
  message?: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!env.webhookUrl) {
      throw new Error("WEBHOOK_URL is not configured");
    }

    const input = parseBody<TriggerEventRequest>(event.body ?? null);
    if (!input.listingId || !input.type) {
      return json(400, { error: "listingId and type are required" });
    }

    const listingResult = await dynamo.send(new QueryCommand({
      TableName: env.listingsTable,
      KeyConditionExpression: "listingId = :listingId",
      ExpressionAttributeValues: {
        ":listingId": input.listingId
      },
      Limit: 1
    }));
    const listing = listingResult.Items?.[0] as Listing | undefined;
    if (!listing) {
      return json(404, { error: "Listing not found" });
    }

    const payload: MarketplaceEvent = {
      eventId: `${input.type}-${input.listingId}-${Date.now()}`,
      listingId: input.listingId,
      marketplaceListingId: listing.marketplaceListingId,
      type: input.type,
      message: input.message ?? defaultMessage(input.type, listing.title),
      occurredAt: new Date().toISOString(),
      payload: {
        source: "manual_mock_trigger"
      }
    };

    const body = JSON.stringify(payload);
    const response = await fetch(env.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Marketplace-Signature": signBody(body, env.webhookSecret)
      },
      body
    });

    if (!response.ok) {
      return json(502, { error: "Webhook receiver rejected event", status: response.status });
    }

    return json(202, { sent: true, event: payload });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Unable to trigger mock event" });
  }
};

function defaultMessage(type: "item_sold" | "new_comment", title: string): string {
  if (type === "item_sold") {
    return `Mock buyer purchased "${title}".`;
  }
  return `Mock buyer asked: Is "${title}" still available?`;
}
