export interface WebhookDeliveryRecord {
  processedAt: string;
  webhookId: string;
}

export interface WebhookDeliveryStore {
  find: (webhookId: string) => Promise<WebhookDeliveryRecord | null>;
  save: (record: WebhookDeliveryRecord) => Promise<void>;
}

/** Records a webhook id once. A second claim is a replay and must not change grants. */
export const claimWebhookDelivery = async (
  store: WebhookDeliveryStore,
  webhookId: string,
  processedAt: string
): Promise<"claimed" | "duplicate"> => {
  const existing = await store.find(webhookId);
  if (existing) {
    return "duplicate";
  }
  await store.save({ processedAt, webhookId });
  return "claimed";
};
