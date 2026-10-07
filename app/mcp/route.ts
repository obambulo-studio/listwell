import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { readListwellHealth } from "@/app/api/health/route";
import {
  parseBearerAgentKey,
  resolveAgentKeyUserId,
} from "@/lib/agent-api-keys";
import {
  getBusinessReportForAgent,
  listBusinessesForAgent,
} from "@/lib/agent-report";
import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
} from "@/lib/audit-env";
import { discoverBusiness, discoverRequestSchema } from "@/lib/discover";
import { runListingAudit } from "@/lib/listing-audit-workflow";
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

const runListingAuditTool = async (
  input: {
    businessName: string;
    candidateId?: string;
    near?: string;
    websiteUrl?: string;
  },
  request: Request
): Promise<McpToolOutcome> => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "mcp-listing-audit",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 8,
      request,
    });
    if (!allowed) {
      return {
        error: "Too many requests. Try again soon.",
        ok: false,
        status: 429,
      };
    }
    const outcome = await runListingAudit(
      input,
      await getAuditEngineEnv(),
      await getFetchWebsiteOptions()
    );
    if (!outcome.ok) {
      return outcome;
    }
    return { body: outcome.body, ok: true };
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: "Invalid audit request", ok: false, status: 400 };
    }
    return { error: "Could not run listing audit", ok: false, status: 500 };
  }
};

const resolveAgentUser = (request: Request): Promise<string | null> => {
  const token = parseBearerAgentKey(request.headers.get("authorization"));
  if (!token) {
    return Promise.resolve(null);
  }
  return resolveAgentKeyUserId(token);
};

const listMyBusinesses = async (userId: string): Promise<McpToolOutcome> => {
  try {
    const businesses = await listBusinessesForAgent(userId);
    return { body: { businesses }, ok: true };
  } catch {
    return { error: "Could not list businesses", ok: false, status: 500 };
  }
};

const getBusinessReport = async (
  userId: string,
  businessId: string,
  request: Request
): Promise<McpToolOutcome> => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "mcp-business-report",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 12,
      request,
    });
    if (!allowed) {
      return {
        error: "Too many requests. Try again soon.",
        ok: false,
        status: 429,
      };
    }
    const outcome = await getBusinessReportForAgent(userId, businessId);
    if (!outcome.ok) {
      return outcome;
    }
    return { body: outcome.body, ok: true };
  } catch {
    return { error: "Could not load business report", ok: false, status: 500 };
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
    getBusinessReport,
    listMyBusinesses,
    readHealth: readListwellHealth,
    resolveAgentUser,
    runListingAudit: runListingAuditTool,
  });

export const DELETE = () =>
  NextResponse.json({ error: "No MCP session." }, { status: 404 });
