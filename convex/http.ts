import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";

const http = httpRouter();
const siteUrl = process.env.SITE_URL;

authComponent.registerRoutesLazy(http, createAuth, {
  cors: true,
  ...(siteUrl ? { trustedOrigins: [siteUrl] } : {}),
});

export default http;
