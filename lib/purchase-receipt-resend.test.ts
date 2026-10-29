import { describe, expect, it } from "vitest";

import { decidePurchaseReceiptResend } from "./purchase-receipt-resend";
import type { PurchaseReceiptResendTarget } from "./purchase-receipt-resend";

const activeOrder = {
  purchaseEmailSentAt: null,
  purchaserEmail: "owner@harbour.example",
  status: "active",
} satisfies PurchaseReceiptResendTarget;

describe(decidePurchaseReceiptResend, () => {
  it("allows an active report order that has never been emailed", () => {
    expect(decidePurchaseReceiptResend(activeOrder)).toStrictEqual({
      email: "owner@harbour.example",
      ok: true,
    });
  });

  it("trims the purchaser email before accepting it", () => {
    expect(
      decidePurchaseReceiptResend({
        ...activeOrder,
        purchaserEmail: "  owner@harbour.example  ",
      })
    ).toStrictEqual({
      email: "owner@harbour.example",
      ok: true,
    });
  });

  it("refuses an order with no report entitlement", () => {
    expect(decidePurchaseReceiptResend(null)).toStrictEqual({
      error: "No report purchase for that order",
      ok: false,
    });
  });

  it("refuses an inactive entitlement", () => {
    expect(
      decidePurchaseReceiptResend({ ...activeOrder, status: "cancelled" })
    ).toStrictEqual({
      error: "Entitlement is not active",
      ok: false,
    });
    expect(
      decidePurchaseReceiptResend({ ...activeOrder, status: "revoked" })
    ).toStrictEqual({
      error: "Entitlement is not active",
      ok: false,
    });
  });

  it("refuses a receipt that was already sent", () => {
    expect(
      decidePurchaseReceiptResend({
        ...activeOrder,
        purchaseEmailSentAt: "2026-10-28T00:00:00.000Z",
      })
    ).toStrictEqual({
      error: "Purchase receipt was already sent",
      ok: false,
    });
  });

  it("refuses a purchase with no usable email", () => {
    expect(
      decidePurchaseReceiptResend({ ...activeOrder, purchaserEmail: null })
    ).toStrictEqual({
      error: "Purchase has no email address",
      ok: false,
    });
    expect(
      decidePurchaseReceiptResend({
        ...activeOrder,
        purchaserEmail: "not-an-email",
      })
    ).toStrictEqual({
      error: "Purchase has no email address",
      ok: false,
    });
  });
});
