import { NextResponse } from "next/server";

import {
  polarWebhookEventSchema,
  polarWebhookHeadersSchema,
  verifyPolarSignature,
} from "@/lib/polar";
import { applyPolarWebhookEvent, getPolarConfig } from "@/lib/polar-server";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const config = await getPolarConfig();
  if (!config?.webhookSecret) {
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503 }
    );
  }

  const headers = polarWebhookHeadersSchema.safeParse({
    id: request.headers.get("webhook-id"),
    signature: request.headers.get("webhook-signature"),
    timestamp: request.headers.get("webhook-timestamp"),
  });
  if (!headers.success) {
    return NextResponse.json(
      { error: "Missing webhook signature headers" },
      { status: 400 }
    );
  }

  const raw = await request.text();
  const valid = await verifyPolarSignature(
    raw,
    headers.data,
    config.webhookSecret
  );
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 403 }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = polarWebhookEventSchema.parse(json);
  await applyPolarWebhookEvent(event);
  return new NextResponse(null, { status: 202 });
};
