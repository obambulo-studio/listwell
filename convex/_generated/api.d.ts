/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as businesses from "../businesses.js";
import type * as claims from "../claims.js";
import type * as crons from "../crons.js";
import type * as entitlements from "../entitlements.js";
import type * as http from "../http.js";
import type * as report_shares from "../report-shares.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_internal from "../lib/internal.js";
import type * as lib_validators from "../lib/validators.js";
import type * as notification_preferences from "../notification-preferences.js";
import type * as scans from "../scans.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  businesses: typeof businesses;
  claims: typeof claims;
  crons: typeof crons;
  entitlements: typeof entitlements;
  http: typeof http;
  "report-shares": typeof report_shares;
  "lib/email": typeof lib_email;
  "lib/internal": typeof lib_internal;
  "lib/validators": typeof lib_validators;
  "notification-preferences": typeof notification_preferences;
  scans: typeof scans;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
