export class CheckoutAnalyticsRequiresMonthlyScansError extends Error {
  constructor() {
    super("Web analytics requires an active monthly scans plan");
    this.name = "CheckoutAnalyticsRequiresMonthlyScansError";
  }
}
