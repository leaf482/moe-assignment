import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "./env";
import type { Activity, ActivityType, ListingStatus } from "./types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export { dynamo, PutCommand, QueryCommand, ScanCommand, UpdateCommand };

export async function addActivity(input: {
  listingId: string;
  type: ActivityType;
  message: string;
  marketplaceEventId?: string;
  rawPayload?: unknown;
}): Promise<Activity> {
  const now = new Date().toISOString();
  const activity: Activity = {
    listingId: input.listingId,
    activityId: `${now}#${crypto.randomUUID()}`,
    type: input.type,
    message: input.message,
    createdAt: now,
    marketplaceEventId: input.marketplaceEventId,
    rawPayload: input.rawPayload
  };

  await dynamo.send(new PutCommand({
    TableName: env.activityTable,
    Item: activity
  }));

  return activity;
}

export async function updateListingStatus(input: {
  listingId: string;
  status: ListingStatus;
  marketplaceListingId?: string;
}): Promise<void> {
  const names: Record<string, string> = {
    "#status": "status",
    "#updatedAt": "updatedAt"
  };
  const values: Record<string, unknown> = {
    ":status": input.status,
    ":updatedAt": new Date().toISOString()
  };
  const assignments = ["#status = :status", "#updatedAt = :updatedAt"];

  if (input.marketplaceListingId) {
    names["#marketplaceListingId"] = "marketplaceListingId";
    values[":marketplaceListingId"] = input.marketplaceListingId;
    assignments.push("#marketplaceListingId = :marketplaceListingId");
  }

  await dynamo.send(new UpdateCommand({
    TableName: env.listingsTable,
    Key: { listingId: input.listingId },
    UpdateExpression: `SET ${assignments.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values
  }));
}
