import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { readListwellHealth } from "@/app/api/health/route";
import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
} from "@/lib/audit-env";
import { discoverBusiness, discoverRequestSchema } from "@/lib/discover";
import { handleMcpPost } from "@/lib/mcp-http";
import type { McpDiscoverInput, McpToolOutcome } from "@/lib/mcp-http";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

const allowMethods = "GET, POST, DELETE";

const discoverListings = async (
  input: McpDiscoverInput,
  request: Request
): Promise<McpToolOutcome> => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "discover",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 20,
      request,
    });
    if (!allowed) {
      return {
        error: "Too many requests. Try again soon.",
        ok: false,
        status: 429,
      };
    }
    const parsed = discoverRequestSchema.parse({
      businessName: input.businessName,
      ...(input.near === undefined ? {} : { near: input.near }),
    });
    const result = await discoverBusiness(
      parsed,
      await getAuditEngineEnv(),
      await getFetchWebsiteOptions()
    );
    return { body: result, ok: true };
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: "Invalid discover request", ok: false, status: 400 };
    }
    return { error: "Could not search listings", ok: false, status: 500 };
  }
};

export const GET = () =>
  NextResponse.json(
    {
      error:
        "This MCP endpoint does not offer a server-sent event stream. POST JSON-RPC messages.",
    },
    {
      headers: { Allow: allowMethods },
      status: 405,
    }
  );

export const POST = (request: Request) =>
  handleMcpPost(request, {
    discoverListings,
    readHealth: readListwellHealth,
  });

export const DELETE = () =>
  NextResponse.json({ error: "No MCP session." }, { status: 404 });
