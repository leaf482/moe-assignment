import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { env } from "../lib/env";
import { dynamo, PutCommand } from "../lib/db";
import { json, parseBody } from "../lib/http";
import { signBody } from "../lib/signing";

interface MockPublishRequest {
  listingId: string;
  title: string;
  description: string;
  priceCents: number;
  sellerId: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!env.webhookUrl) {
      throw new Error("WEBHOOK_URL is not configured");
    }

    const idempotencyKey = event.headers["idempotency-key"] ?? event.headers["Idempotency-Key"];
    if (!idempotencyKey) {
      return json(400, { error: "Idempotency-Key header is required" });
    }

    const input = parseBody<MockPublishRequest>(event.body ?? null);
    const marketplaceListingId = `mock-ebay-${input.listingId.slice(0, 8)}`;

    if (Math.random() < 0.15) {
      return json(429, { error: "Synthetic marketplace rate limit" });
    }

    try {
      await dynamo.send(new PutCommand({
        TableName: env.mockPublishTable,
        Item: {
          idempotencyKey,
          marketplaceListingId,
          listingId: input.listingId,
          createdAt: new Date().toISOString()
        },
        ConditionExpression: "attribute_not_exists(idempotencyKey)"
      }));
    } catch (error) {
      if (error instanceof Error && error.name !== "ConditionalCheckFailedException") {
        throw error;
      }
      await emitWebhook({
        eventId: `publish-${input.listingId}`,
        listingId: input.listingId,
        marketplaceListingId,
        type: "publish_succeeded",
        message: `Mock eBay accepted "${input.title}".`,
        occurredAt: new Date().toISOString(),
        payload: {
          sellerId: input.sellerId,
          priceCents: input.priceCents,
          duplicatePublish: true
        }
      });
      return json(202, {
        accepted: true,
        duplicate: true,
        marketplaceListingId
      });
    }

    await emitWebhook({
      eventId: `publish-${input.listingId}`,
      listingId: input.listingId,
      marketplaceListingId,
      type: "publish_succeeded",
      message: `Mock eBay accepted "${input.title}".`,
      occurredAt: new Date().toISOString(),
      payload: {
        sellerId: input.sellerId,
        priceCents: input.priceCents
      }
    });

    return json(202, {
      accepted: true,
      marketplaceListingId
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Mock marketplace publish failed" });
  }
};

async function emitWebhook(payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const response = await fetch(env.webhookUrl!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Marketplace-Signature": signBody(body, env.webhookSecret)
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Webhook callback failed: ${response.status}`);
  }
}
