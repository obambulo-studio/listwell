import {
  ConnectionError,
  RequestTimeoutError,
} from "@polar-sh/sdk/models/errors/httpclienterrors";
import { HTTPValidationError } from "@polar-sh/sdk/models/errors/httpvalidationerror";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { ResponseValidationError } from "@polar-sh/sdk/models/errors/responsevalidationerror";
import { z } from "zod";

import type { CheckoutPlan } from "./schema";

export { CheckoutResponseShapeError } from "./checkout-response-shape-error";

export class CheckoutPlanNotConfiguredError extends Error {
  readonly plan: CheckoutPlan;

  constructor(plan: CheckoutPlan) {
    super(`Checkout plan not configured: ${plan}`);
    this.name = "CheckoutPlanNotConfiguredError";
    this.plan = plan;
  }
}

const planNotConfiguredMessage = (plan: CheckoutPlan): string => {
  if (plan === "monthly") {
    return "Monthly billing is not available yet.";
  }
  if (plan === "yearly") {
    return "Yearly billing is not available yet.";
  }
  return "Payment is not configured";
};

export const checkoutCreateFailureLog = (
  error: unknown,
  context: { businessId: string; plan: CheckoutPlan }
): void => {
  if (error instanceof CheckoutPlanNotConfiguredError) {
    console.warn("Checkout plan product id missing", {
      businessId: context.businessId,
      plan: context.plan,
    });
    return;
  }

  if (error instanceof CheckoutResponseShapeError) {
    const zodError = error.cause;
    console.error("Polar checkout response shape mismatch", {
      businessId: context.businessId,
      issues:
        zodError instanceof z.ZodError
          ? zodError.issues.map((issue) => ({
              code: issue.code,
              path: issue.path,
            }))
          : undefined,
      plan: context.plan,
    });
    return;
  }

  const polarStatus =
    error instanceof PolarError ? error.statusCode : undefined;
  const validationSummary =
    error instanceof HTTPValidationError
      ? error.detail?.map((item) => ({
          loc: item.loc,
          type: item.type,
        }))
      : undefined;

  console.error("Polar checkout create failed", {
    businessId: context.businessId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    plan: context.plan,
    polarStatus,
    validationSummary,
  });
};

export const checkoutCreateHttpError = (
  error: unknown
): { message: string; status: number } => {
  if (error instanceof CheckoutPlanNotConfiguredError) {
    return {
      message: planNotConfiguredMessage(error.plan),
      status: 503,
    };
  }

  if (
    error instanceof CheckoutResponseShapeError ||
    error instanceof PolarError ||
    error instanceof ConnectionError ||
    error instanceof RequestTimeoutError ||
    error instanceof ResponseValidationError
  ) {
    return {
      message: "Could not start checkout. Try again soon.",
      status: 502,
    };
  }

  if (error instanceof Error && error.message === "Payment is not configured") {
    return { message: "Payment is not configured", status: 503 };
  }

  return {
    message: "Could not start checkout. Try again soon.",
    status: 502,
  };
};
