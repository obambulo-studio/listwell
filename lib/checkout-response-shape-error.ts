import type { ZodError } from "zod";

export class CheckoutResponseShapeError extends Error {
  constructor(cause: ZodError) {
    super("Polar checkout response did not match expected shape");
    this.name = "CheckoutResponseShapeError";
    this.cause = cause;
  }
}
