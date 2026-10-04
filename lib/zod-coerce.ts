import { z } from "zod";

const undefinedToNull = (value: unknown): unknown =>
  value === undefined ? null : value;

/** Convex optional fields may arrive as `undefined`; treat like `null`. */
export const zNullableString = z.preprocess(
  undefinedToNull,
  z.string().nullable()
);
