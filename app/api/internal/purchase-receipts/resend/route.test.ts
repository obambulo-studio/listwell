import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PurchaseReceiptTarget } from "@/lib/data";
import type { PurchaseReceiptSendResult } from "@/lib/purchase-email";

const { getCloudflareEnv, getPurchaseReceiptForOrder, sendPurchaseReceipt } =
  vi.hoisted(() => ({
    getCloudflareEnv: vi.fn<() => Promise<null>>(),
    getPurchaseReceiptForOrder:
      vi.fn<(polarOrderId: string) => Promise<PurchaseReceiptTarget | null>>(),
    sendPurchaseReceipt: vi.fn<() => Promise<PurchaseReceiptSendResult>>(),
  }));

vi.mock(import("@/lib/audit-env"), () => ({
  getCloudflareEnv,
}));

vi.mock(import("@/lib/data"), () => ({
  getPurchaseReceiptForOrder,
}));

vi.mock(import("@/lib/purchase-email"), () => ({
  sendPurchaseReceipt,
}));

const order = {
  businessExternalId: "biz_harbour",
  kind: "report_once",
  purchaseEmailSentAt: null,
  purchaserEmail: "owner@example.com",
  status: "active",
} as const;

const post = (body: unknown, authorization?: string): Promise<Response> => {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return import("./route").then(({ POST }) =>
    POST(
      new Request(
        "https://listwell.dev/api/internal/purchase-receipts/resend",
        {
          body: JSON.stringify(body),
          headers,
          method: "POST",
        }
      )
    )
  );
};

describe("POST /api/internal/purchase-receipts/resend", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCloudflareEnv.mockResolvedValue(null);
    getPurchaseReceiptForOrder.mockResolvedValue(order);
    sendPurchaseReceipt.mockResolvedValue({ status: "sent" });
  });

  it("rejects requests without the internal secret", async () => {
    const response = await post({ polarOrderId: "order_1" });
    expect(response.status).toBe(401);
    expect(sendPurchaseReceipt).not.toHaveBeenCalled();
  });

  it("sends the receipt for an active order that has not been emailed", async () => {
    const response = await post(
      { polarOrderId: "order_1" },
      "Bearer test-internal-secret"
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ ok: true });
    expect(getPurchaseReceiptForOrder).toHaveBeenCalledWith("order_1");
    expect(sendPurchaseReceipt).toHaveBeenCalledWith({
      businessId: "biz_harbour",
      email: "owner@example.com",
      kind: "report_once",
    });
  });

  it("does not send when the receipt was already delivered", async () => {
    getPurchaseReceiptForOrder.mockResolvedValue({
      ...order,
      purchaseEmailSentAt: "2026-10-28T00:00:00.000Z",
    });
    const response = await post(
      { polarOrderId: "order_1" },
      "Bearer test-internal-secret"
    );
    expect(response.status).toBe(409);
    expect(sendPurchaseReceipt).not.toHaveBeenCalled();
  });

  it("does not send when the order has no report entitlement", async () => {
    getPurchaseReceiptForOrder.mockResolvedValue(null);
    const response = await post(
      { polarOrderId: "order_missing" },
      "Bearer test-internal-secret"
    );
    expect(response.status).toBe(404);
    expect(sendPurchaseReceipt).not.toHaveBeenCalled();
  });
});
