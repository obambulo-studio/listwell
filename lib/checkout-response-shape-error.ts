import { z } from "zod";

export class CheckoutResponseShapeError extends Error {
  constructor(cause: z.ZodError) {
    super("Polar checkout response did not match expected shape");
    this.name = "CheckoutResponseShapeError";
    this.cause = cause;
  }
}
