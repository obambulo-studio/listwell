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
import type * as businessGuests from "../businessGuests.js";
import type * as businesses from "../businesses.js";
import type * as checkSnapshots from "../checkSnapshots.js";
import type * as claims from "../claims.js";
import type * as crons from "../crons.js";
import type * as entitlements from "../entitlements.js";
import type * as http from "../http.js";
import type * as lib_analyticsMonth from "../lib/analyticsMonth.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_internal from "../lib/internal.js";
import type * as lib_normalizeEmail from "../lib/normalizeEmail.js";
import type * as lib_reportEntitlements from "../lib/reportEntitlements.js";
import type * as lib_responseValidators from "../lib/responseValidators.js";
import type * as lib_runInSeries from "../lib/runInSeries.js";
import type * as lib_scanFreshness from "../lib/scanFreshness.js";
import type * as lib_scanResults from "../lib/scanResults.js";
import type * as lib_seo from "../lib/seo.js";
import type * as lib_validators from "../lib/validators.js";
import type * as notificationPreferences from "../notificationPreferences.js";
import type * as profilePhoto from "../profilePhoto.js";
import type * as reportShares from "../reportShares.js";
import type * as scans from "../scans.js";
import type * as seo from "../seo.js";
import type * as users from "../users.js";
import type * as webAnalytics from "../webAnalytics.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  businessGuests: typeof businessGuests;
  businesses: typeof businesses;
  checkSnapshots: typeof checkSnapshots;
  claims: typeof claims;
  crons: typeof crons;
  entitlements: typeof entitlements;
  http: typeof http;
  "lib/analyticsMonth": typeof lib_analyticsMonth;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/email": typeof lib_email;
  "lib/internal": typeof lib_internal;
  "lib/normalizeEmail": typeof lib_normalizeEmail;
  "lib/reportEntitlements": typeof lib_reportEntitlements;
  "lib/responseValidators": typeof lib_responseValidators;
  "lib/runInSeries": typeof lib_runInSeries;
  "lib/scanFreshness": typeof lib_scanFreshness;
  "lib/scanResults": typeof lib_scanResults;
  "lib/seo": typeof lib_seo;
  "lib/validators": typeof lib_validators;
  notificationPreferences: typeof notificationPreferences;
  profilePhoto: typeof profilePhoto;
  reportShares: typeof reportShares;
  scans: typeof scans;
  seo: typeof seo;
  users: typeof users;
  webAnalytics: typeof webAnalytics;
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
