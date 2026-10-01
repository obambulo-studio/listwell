import { httpRouter } from "convex/server";

import { env } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();
const siteUrl = env.SITE_URL;

authComponent.registerRoutesLazy(http, createAuth, {
  cors: true,
  ...(siteUrl ? { trustedOrigins: [siteUrl] } : {}),
});

export default http;
