function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const env = {
  listingsTable: required("LISTINGS_TABLE"),
  activityTable: required("ACTIVITY_TABLE"),
  webhookEventsTable: required("WEBHOOK_EVENTS_TABLE"),
  mockPublishTable: required("MOCK_PUBLISH_TABLE"),
  publishQueueUrl: required("PUBLISH_QUEUE_URL"),
  webhookSecret: required("WEBHOOK_SECRET"),
  mockMarketplaceUrl: process.env.MOCK_MARKETPLACE_URL,
  webhookUrl: process.env.WEBHOOK_URL
};
