const apiUrl = process.env.API_URL;

if (!apiUrl) {
  console.error("Set API_URL to the deployed ApiUrl output, then run npm run smoke.");
  process.exit(1);
}

const listingResponse = await fetch(`${apiUrl}listings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: `Smoke test listing ${Date.now()}`,
    description: "Created by the deployed smoke test.",
    price: 19.99
  })
});

if (!listingResponse.ok) {
  throw new Error(`Create listing failed: ${listingResponse.status} ${await listingResponse.text()}`);
}

const { listing } = await listingResponse.json();
console.log(`Created listing ${listing.listingId}`);

await new Promise((resolve) => setTimeout(resolve, 3000));

const eventResponse = await fetch(`${apiUrl}mock-marketplace/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    listingId: listing.listingId,
    type: "new_comment"
  })
});

if (!eventResponse.ok) {
  throw new Error(`Trigger event failed: ${eventResponse.status} ${await eventResponse.text()}`);
}

const listResponse = await fetch(`${apiUrl}listings`);
if (!listResponse.ok) {
  throw new Error(`List listings failed: ${listResponse.status} ${await listResponse.text()}`);
}

const payload = await listResponse.json();
const created = payload.listings.find((item) => item.listingId === listing.listingId);
if (!created?.activities?.some((activity) => activity.type === "new_comment")) {
  throw new Error("Smoke test did not find the generated new_comment activity.");
}

console.log("Smoke test passed.");
