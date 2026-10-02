import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  CheckoutPlanNotConfiguredError,
  CheckoutResponseShapeError,
  checkoutCreateFailureLog,
  checkoutCreateHttpError,
} from "./checkout-create-error";

describe(checkoutCreateHttpError, () => {
  it("maps missing monthly plan config to 503", () => {
    const result = checkoutCreateHttpError(
      new CheckoutPlanNotConfiguredError("monthly")
    );
    expect(result.status).toBe(503);
    expect(result.message).toBe("Monthly billing is not available yet.");
  });

  it("maps missing yearly plan config to 503", () => {
    const result = checkoutCreateHttpError(
      new CheckoutPlanNotConfiguredError("yearly")
    );
    expect(result.status).toBe(503);
    expect(result.message).toBe("Yearly billing is not available yet.");
  });

  it("maps Polar upstream failures to 502 with a stable message", () => {
    const polarError = new PolarError("Product not found", {
      body: '{"detail":"secret"}',
      request: new Request("https://api.polar.sh/v1/checkouts"),
      response: new Response("", { status: 404 }),
    });
    const result = checkoutCreateHttpError(polarError);
    expect(result.status).toBe(502);
    expect(result.message).toBe("Could not start checkout. Try again soon.");
  });

  it("maps response shape errors to 502", () => {
    const zodError = z
      .object({ url: z.string().min(1) })
      .safeParse({ url: "" }).error;
    if (!zodError) {
      throw new Error("Expected zod error");
    }
    const result = checkoutCreateHttpError(
      new CheckoutResponseShapeError(zodError)
    );
    expect(result.status).toBe(502);
    expect(result.message).toBe("Could not start checkout. Try again soon.");
  });
});

describe(checkoutCreateFailureLog, () => {
  it("logs plan gaps without Polar payloads", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkoutCreateFailureLog(
      new CheckoutPlanNotConfiguredError("yearly"),
      { businessId: "biz_reports_1", plan: "yearly" }
    );
    expect(warn).toHaveBeenCalledWith(
      "Checkout plan product id missing",
      expect.objectContaining({ plan: "yearly" })
    );
    warn.mockRestore();
  });

  it("logs Polar status without response body", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const polarError = new PolarError("Upstream failure", {
      body: '{"customer_email":"user@example.com"}',
      request: new Request("https://api.polar.sh/v1/checkouts"),
      response: new Response("", { status: 422 }),
    });
    checkoutCreateFailureLog(polarError, {
      businessId: "biz_reports_1",
      plan: "once",
    });
    expect(errorLog).toHaveBeenCalledWith(
      "Polar checkout create failed",
      expect.objectContaining({
        polarStatus: 422,
        plan: "once",
      })
    );
    const logged = errorLog.mock.calls[0]?.[1];
    expect(logged).not.toHaveProperty("body");
    errorLog.mockRestore();
  });
});
