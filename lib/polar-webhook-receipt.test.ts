import { describe, expect, it } from "vitest";

import { claimWebhookDelivery } from "./polar-webhook-receipt";
import type {
  WebhookDeliveryRecord,
  WebhookDeliveryStore,
} from "./polar-webhook-receipt";

const memoryStore = (): WebhookDeliveryStore & {
  records: WebhookDeliveryRecord[];
} => {
  const records: WebhookDeliveryRecord[] = [];
  return {
    find: (webhookId) =>
      Promise.resolve(
        records.find((record) => record.webhookId === webhookId) ?? null
      ),
    records,
    save: (record) => {
      records.push(record);
      return Promise.resolve();
    },
  };
};

describe(claimWebhookDelivery, () => {
  it("claims the first delivery and ignores a replay", async () => {
    const store = memoryStore();
    await expect(
      claimWebhookDelivery(store, "msg_1", "2026-10-25T00:00:00.000Z")
    ).resolves.toBe("claimed");
    await expect(
      claimWebhookDelivery(store, "msg_1", "2026-10-25T00:01:00.000Z")
    ).resolves.toBe("duplicate");
    expect(store.records).toHaveLength(1);
  });

  it("keeps a revoked grant revoked when the same order.paid webhook is replayed", async () => {
    const store = memoryStore();
    let status: "active" | "revoked" = "revoked";
    const applyOrderPaid = async (
      webhookId: string
    ): Promise<typeof status> => {
      const outcome = await claimWebhookDelivery(
        store,
        webhookId,
        "2026-10-25T00:00:00.000Z"
      );
      if (outcome === "duplicate") {
        return status;
      }
      status = "active";
      return status;
    };

    await expect(applyOrderPaid("msg_paid")).resolves.toBe("active");
    status = "revoked";
    await expect(applyOrderPaid("msg_paid")).resolves.toBe("revoked");
    await expect(applyOrderPaid("msg_paid_again")).resolves.toBe("active");
  });
});
