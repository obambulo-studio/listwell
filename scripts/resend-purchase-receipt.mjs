/**
 * Resend the purchase receipt for an existing Polar order.
 *
 * The Worker route is not public. It requires Authorization: Bearer
 * INTERNAL_API_SECRET, and it refuses orders whose receipt was already sent.
 *
 *   SITE_URL=https://<worker-origin> INTERNAL_API_SECRET=... \
 *     bun scripts/resend-purchase-receipt.mjs <polarOrderId>
 *
 * This sends a real email. Point SITE_URL at the environment you mean to use.
 */

const usage =
  "Usage: SITE_URL=https://<worker-origin> INTERNAL_API_SECRET=... bun scripts/resend-purchase-receipt.mjs <polarOrderId>";

const orderId = process.argv[2]?.trim();
const siteUrl = process.env.SITE_URL?.trim();
const secret = process.env.INTERNAL_API_SECRET?.trim();

if (!orderId || !siteUrl || !secret) {
  console.error(usage);
  process.exit(1);
}

let endpoint;
try {
  endpoint = new URL(
    "/api/internal/purchase-receipts/resend",
    siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`
  );
} catch {
  console.error(usage);
  process.exit(1);
}

const response = await fetch(endpoint, {
  body: JSON.stringify({ polarOrderId: orderId }),
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  method: "POST",
});

const body = await response.text();
if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(body);
