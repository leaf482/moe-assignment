import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { env } from "../lib/env";
import { dynamo, QueryCommand, ScanCommand } from "../lib/db";
import { json } from "../lib/http";
import type { Activity, Listing } from "../lib/types";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  try {
    const listingsResult = await dynamo.send(new ScanCommand({
      TableName: env.listingsTable
    }));

    const listings = ((listingsResult.Items ?? []) as Listing[])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const items = await Promise.all(listings.map(async (listing) => {
      const activitiesResult = await dynamo.send(new QueryCommand({
        TableName: env.activityTable,
        KeyConditionExpression: "listingId = :listingId",
        ExpressionAttributeValues: {
          ":listingId": listing.listingId
        },
        ScanIndexForward: false,
        Limit: 10
      }));

      return {
        ...listing,
        price: listing.priceCents / 100,
        activities: (activitiesResult.Items ?? []) as Activity[]
      };
    }));

    return json(200, { listings: items });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Unable to load listings" });
  }
};
