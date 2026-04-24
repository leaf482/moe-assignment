export type ListingStatus = "publishing" | "published" | "publish_failed" | "sold";

export type ActivityType =
  | "listing_created"
  | "publish_started"
  | "publish_succeeded"
  | "publish_failed"
  | "item_sold"
  | "new_comment";

export interface Listing {
  listingId: string;
  sellerId: string;
  title: string;
  description: string;
  priceCents: number;
  status: ListingStatus;
  marketplace: "ebay_mock";
  marketplaceListingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  listingId: string;
  activityId: string;
  type: ActivityType;
  message: string;
  createdAt: string;
  marketplaceEventId?: string;
  rawPayload?: unknown;
}

export interface MarketplaceEvent {
  eventId: string;
  listingId: string;
  marketplaceListingId?: string;
  type: "item_sold" | "new_comment" | "publish_succeeded";
  message: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
}
