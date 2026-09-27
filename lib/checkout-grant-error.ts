export class CheckoutGrantError extends Error {
  readonly businessId: string;
  readonly checkoutId: string;

  constructor(businessId: string, checkoutId: string, cause: unknown) {
    const detail =
      cause instanceof Error ? cause.message : "Entitlement grant failed";
    super(`Could not activate purchase: ${detail}`);
    this.name = "CheckoutGrantError";
    this.businessId = businessId;
    this.checkoutId = checkoutId;
  }
}
