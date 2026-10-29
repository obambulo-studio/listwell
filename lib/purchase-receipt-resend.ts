import { z } from "zod";

const purchaserEmailSchema = z.string().email();

export interface PurchaseReceiptResendTarget {
  purchaseEmailSentAt: string | null;
  purchaserEmail: string | null;
  status: "active" | "cancelled" | "revoked";
}

export type PurchaseReceiptResendDecision =
  | { email: string; ok: true }
  | { error: string; ok: false };

/** Refusal for a receipt resend, or the address to send when the order can go out. */
export const decidePurchaseReceiptResend = (
  target: PurchaseReceiptResendTarget | null
): PurchaseReceiptResendDecision => {
  if (!target) {
    return { error: "No report purchase for that order", ok: false };
  }
  if (target.status !== "active") {
    return { error: "Entitlement is not active", ok: false };
  }
  if (target.purchaseEmailSentAt) {
    return { error: "Purchase receipt was already sent", ok: false };
  }
  const parsed = purchaserEmailSchema.safeParse(
    target.purchaserEmail?.trim() ?? ""
  );
  if (!parsed.success) {
    return { error: "Purchase has no email address", ok: false };
  }
  return { email: parsed.data, ok: true };
};
