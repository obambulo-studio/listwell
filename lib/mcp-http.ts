import { ZodError, z } from "zod";

import { LISTWELL_MCP_VERSION } from "@/lib/agent-ready-metadata";
import { listwellSiteUrl } from "@/lib/site-metadata";

const JSON_RPC_PARSE_ERROR = -32_700;
const JSON_RPC_INVALID_REQUEST = -32_600;
const JSON_RPC_METHOD_NOT_FOUND = -32_601;
const JSON_RPC_INVALID_PARAMS = -32_602;

const supportedProtocolVersions = [
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
] as const;

type McpProtocolVersion = (typeof supportedProtocolVersions)[number];

const latestProtocolVersion: McpProtocolVersion = "2025-11-25";

const jsonRpcIdSchema = z.union([z.string(), z.number().finite(), z.null()]);

type JsonRpcId = z.infer<typeof jsonRpcIdSchema>;

const jsonRpcRequestSchema = z.object({
  id: jsonRpcIdSchema.optional(),
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const initializeParamsSchema = z
  .object({
    protocolVersion: z.string().min(1),
  })
  .passthrough();

const toolArgumentsSchema = z.record(z.string(), z.unknown());

const toolsListParamsSchema = z
  .object({
    cursor: z.string().optional(),
  })
  .passthrough();

const toolsCallParamsSchema = z
  .object({
    arguments: toolArgumentsSchema.optional(),
    name: z.string().min(1),
  })
  .passthrough();

const emptyArgsSchema = z.object({}).strict();

const discoverArgsSchema = z.object({
  businessName: z.string().trim().min(1),
  near: z.string().trim().min(1).optional(),
});

const structuredContentSchema = z.record(z.string(), z.unknown());

export interface McpToolFailure {
  error: string;
  ok: false;
  status: number;
}

export interface McpToolSuccess {
  body: unknown;
  ok: true;
}

export type McpToolOutcome = McpToolFailure | McpToolSuccess;

export interface McpDiscoverInput {
  businessName: string;
  near?: string;
}

export interface McpReadDependencies {
  discoverListings: (
    input: McpDiscoverInput,
    request: Request
  ) => Promise<McpToolOutcome>;
  getBusinessReport: (
    userId: string,
    businessId: string,
    request: Request
  ) => Promise<McpToolOutcome>;
  listMyBusinesses: (userId: string) => Promise<McpToolOutcome>;
  readHealth: () => Promise<unknown>;
  resolveAgentUser: (request: Request) => Promise<string | null>;
  runListingAudit: (
    input: {
      businessName: string;
      candidateId?: string;
      near?: string;
      websiteUrl?: string;
    },
    request: Request
  ) => Promise<McpToolOutcome>;
}

export type McpDependencies = McpReadDependencies;

const MCP_INSTRUCTIONS =
  "Listwell MCP: public tools discover_listings, listwell_health, and run_listing_audit (free basic check, rate limited). Authenticated tools list_my_businesses and get_business_report need Authorization: Bearer with a Listwell API key from your account. Fix steps follow report entitlements.";

const keyedToolNames = new Set(["list_my_businesses", "get_business_report"]);

const runListingAuditArgsSchema = z.object({
  businessName: z.string().trim().min(1),
  candidateId: z.string().trim().min(1).optional(),
  near: z.string().trim().min(1).optional(),
  websiteUrl: z.string().trim().min(1).optional(),
});

const getBusinessReportArgsSchema = z.object({
  businessId: z.string().trim().min(1),
});

const toolDefinitions = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: true,
    },
    description:
      "Search Google, Apple, and OpenStreetMap listings for a business name. Rate limited. Does not save a business or start an audit.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        businessName: {
          description: "Business name to match against map listings",
          minLength: 1,
          type: "string",
        },
        near: {
          description: "Optional suburb, city, or region hint",
          type: "string",
        },
      },
      required: ["businessName"],
      type: "object",
    },
    name: "discover_listings",
    title: "Discover listings",
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    },
    description:
      "Read Listwell audit engine health and lookup provider status.",
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    name: "listwell_health",
    title: "Listwell health",
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description:
      "Run a free basic listing and website SEO audit for a business name. Returns markdown check outcomes or listing candidates when confirmation is needed.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        businessName: {
          description: "Business name to audit",
          minLength: 1,
          type: "string",
        },
        candidateId: {
          description:
            "When a prior call returned candidates, pass candidateId from that response",
          type: "string",
        },
        near: {
          description: "Optional suburb, city, or region hint",
          type: "string",
        },
        websiteUrl: {
          description: "Optional website URL when map match is unclear",
          type: "string",
        },
      },
      required: ["businessName"],
      type: "object",
    },
    name: "run_listing_audit",
    title: "Run listing audit",
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    },
    description:
      "List businesses saved on the signed-in Listwell account. Requires Authorization: Bearer with a Listwell API key.",
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    name: "list_my_businesses",
    title: "List my businesses",
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    },
    description:
      "Fetch a markdown report for an owned business, including fix steps when entitled. Requires Authorization: Bearer with a Listwell API key.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        businessId: {
          description:
            "Business id from list_my_businesses or run_listing_audit",
          minLength: 1,
          type: "string",
        },
      },
      required: ["businessId"],
      type: "object",
    },
    name: "get_business_report",
    title: "Get business report",
  },
] as const;

const isSupportedProtocolVersion = (
  value: string
): value is McpProtocolVersion =>
  supportedProtocolVersions.some((version) => version === value);

const negotiateProtocolVersion = (clientVersion: string): McpProtocolVersion =>
  isSupportedProtocolVersion(clientVersion)
    ? clientVersion
    : latestProtocolVersion;

const headerMediaTypes = (header: string | null): string[] => {
  if (!header) {
    return [];
  }
  const types: string[] = [];
  for (const part of header.split(",")) {
    const mediaType = part.split(";")[0]?.trim().toLowerCase();
    if (mediaType) {
      types.push(mediaType);
    }
  }
  return types;
};

const acceptsStreamableHttp = (accept: string | null): boolean => {
  const types = headerMediaTypes(accept);
  return (
    types.includes("application/json") && types.includes("text/event-stream")
  );
};

const isAllowedMcpOrigin = (
  originHeader: string | null,
  requestUrl: string
): boolean => {
  if (originHeader === null || originHeader.length === 0) {
    return true;
  }
  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return false;
  }
  const host = originUrl.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }
  if (originHeader === new URL(requestUrl).origin) {
    return true;
  }
  return originHeader === listwellSiteUrl();
};

const jsonResponse = (
  body: unknown,
  status: number,
  protocolVersion?: McpProtocolVersion
): Response => {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  if (protocolVersion) {
    headers.set("MCP-Protocol-Version", protocolVersion);
  }
  return Response.json(body, { headers, status });
};

const jsonRpcResult = (
  id: JsonRpcId,
  result: unknown,
  protocolVersion: McpProtocolVersion
): Response =>
  jsonResponse({ id, jsonrpc: "2.0", result }, 200, protocolVersion);

const jsonRpcError = (
  id: JsonRpcId | null,
  code: number,
  message: string,
  protocolVersion?: McpProtocolVersion
): Response =>
  jsonResponse(
    { error: { code, message }, id, jsonrpc: "2.0" },
    200,
    protocolVersion
  );

const accepted = (): Response =>
  new Response(null, {
    headers: { "Cache-Control": "no-store" },
    status: 202,
  });

const toolErrorResult = (message: string) => ({
  content: [{ text: message, type: "text" }],
  isError: true,
});

const toolSuccessResult = (body: unknown) => {
  const structured = structuredContentSchema.safeParse(body);
  return {
    content: [
      {
        text: JSON.stringify(body, null, 2),
        type: "text",
      },
    ],
    ...(structured.success ? { structuredContent: structured.data } : {}),
    isError: false,
  };
};

const protocolVersionFromHeader = (
  request: Request
): McpProtocolVersion | Response => {
  const header = request.headers.get("mcp-protocol-version");
  if (header === null || header.length === 0) {
    return "2025-03-26";
  }
  const value = header.trim();
  if (!isSupportedProtocolVersion(value)) {
    return jsonResponse(
      {
        error: `Unsupported MCP-Protocol-Version. Supported: ${supportedProtocolVersions.join(", ")}.`,
      },
      400
    );
  }
  return value;
};

const callKeyedMcpTool = async (
  name: string,
  args: unknown,
  request: Request,
  dependencies: McpDependencies
): Promise<
  | { kind: "error"; response: ReturnType<typeof toolErrorResult> }
  | { kind: "success"; response: ReturnType<typeof toolSuccessResult> }
> => {
  const userId = await dependencies.resolveAgentUser(request);
  if (!userId) {
    return {
      kind: "error",
      response: toolErrorResult(
        "Missing or invalid API key. Create one in Listwell account settings and send Authorization: Bearer lw_…"
      ),
    };
  }
  if (name === "list_my_businesses") {
    emptyArgsSchema.parse(args ?? {});
    const outcome = await dependencies.listMyBusinesses(userId);
    if (!outcome.ok) {
      return { kind: "error", response: toolErrorResult(outcome.error) };
    }
    return { kind: "success", response: toolSuccessResult(outcome.body) };
  }
  const parsed = getBusinessReportArgsSchema.parse(args ?? {});
  const outcome = await dependencies.getBusinessReport(
    userId,
    parsed.businessId,
    request
  );
  if (!outcome.ok) {
    return { kind: "error", response: toolErrorResult(outcome.error) };
  }
  return { kind: "success", response: toolSuccessResult(outcome.body) };
};

const callMcpTool = async (
  name: string,
  args: unknown,
  request: Request,
  dependencies: McpDependencies
): Promise<
  | { kind: "error"; response: ReturnType<typeof toolErrorResult> }
  | { kind: "missing" }
  | { kind: "success"; response: ReturnType<typeof toolSuccessResult> }
> => {
  try {
    if (keyedToolNames.has(name)) {
      return await callKeyedMcpTool(name, args, request, dependencies);
    }

    if (name === "listwell_health") {
      emptyArgsSchema.parse(args ?? {});
      return {
        kind: "success",
        response: toolSuccessResult(await dependencies.readHealth()),
      };
    }
    if (name === "discover_listings") {
      const parsed = discoverArgsSchema.parse(args ?? {});
      const outcome = await dependencies.discoverListings(
        {
          businessName: parsed.businessName,
          ...(parsed.near === undefined ? {} : { near: parsed.near }),
        },
        request
      );
      if (!outcome.ok) {
        return { kind: "error", response: toolErrorResult(outcome.error) };
      }
      return { kind: "success", response: toolSuccessResult(outcome.body) };
    }
    if (name === "run_listing_audit") {
      const parsed = runListingAuditArgsSchema.parse(args ?? {});
      const outcome = await dependencies.runListingAudit(
        {
          businessName: parsed.businessName,
          ...(parsed.candidateId === undefined
            ? {}
            : { candidateId: parsed.candidateId }),
          ...(parsed.near === undefined ? {} : { near: parsed.near }),
          ...(parsed.websiteUrl === undefined
            ? {}
            : { websiteUrl: parsed.websiteUrl }),
        },
        request
      );
      if (!outcome.ok) {
        return { kind: "error", response: toolErrorResult(outcome.error) };
      }
      return { kind: "success", response: toolSuccessResult(outcome.body) };
    }
    return { kind: "missing" };
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0]?.message ?? "Invalid arguments";
      return { kind: "error", response: toolErrorResult(issue) };
    }
    return { kind: "error", response: toolErrorResult("Tool failed") };
  }
};

const dispatchRequest = async (
  method: string,
  params: unknown,
  id: JsonRpcId,
  request: Request,
  dependencies: McpDependencies,
  protocolVersion: McpProtocolVersion
): Promise<Response> => {
  if (method === "ping") {
    return jsonRpcResult(id, {}, protocolVersion);
  }
  if (method === "initialize") {
    const parsed = initializeParamsSchema.safeParse(params);
    if (!parsed.success) {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        "Invalid initialize params",
        protocolVersion
      );
    }
    const negotiated = negotiateProtocolVersion(parsed.data.protocolVersion);
    return jsonRpcResult(
      id,
      {
        capabilities: {
          tools: { listChanged: false },
        },
        instructions: MCP_INSTRUCTIONS,
        protocolVersion: negotiated,
        serverInfo: {
          name: "Listwell",
          version: LISTWELL_MCP_VERSION,
        },
      },
      negotiated
    );
  }
  if (method === "tools/list") {
    const parsed = toolsListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        "Invalid tools/list params",
        protocolVersion
      );
    }
    if (parsed.data.cursor && parsed.data.cursor.length > 0) {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        "Unknown tools/list cursor",
        protocolVersion
      );
    }
    return jsonRpcResult(id, { tools: toolDefinitions }, protocolVersion);
  }
  if (method === "tools/call") {
    const parsed = toolsCallParamsSchema.safeParse(params);
    if (!parsed.success) {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        "Invalid tools/call params",
        protocolVersion
      );
    }
    const called = await callMcpTool(
      parsed.data.name,
      parsed.data.arguments,
      request,
      dependencies
    );
    if (called.kind === "missing") {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        `Unknown tool: ${parsed.data.name}`,
        protocolVersion
      );
    }
    return jsonRpcResult(id, called.response, protocolVersion);
  }
  return jsonRpcError(
    id,
    JSON_RPC_METHOD_NOT_FOUND,
    `Method not found: ${method}`,
    protocolVersion
  );
};

export const handleMcpPost = async (
  request: Request,
  dependencies: McpDependencies
): Promise<Response> => {
  if (!isAllowedMcpOrigin(request.headers.get("origin"), request.url)) {
    return jsonResponse({ error: "Origin is not allowed." }, 403);
  }
  if (!acceptsStreamableHttp(request.headers.get("accept"))) {
    return jsonResponse(
      {
        error: "Accept must include application/json and text/event-stream.",
      },
      406
    );
  }
  const [contentType] = headerMediaTypes(request.headers.get("content-type"));
  if (contentType !== "application/json") {
    return jsonResponse(
      { error: "Content-Type must be application/json." },
      415
    );
  }

  const protocolHeader = protocolVersionFromHeader(request);
  if (protocolHeader instanceof Response) {
    return protocolHeader;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonRpcError(
      null,
      JSON_RPC_PARSE_ERROR,
      "Parse error",
      protocolHeader
    );
  }
  if (Array.isArray(payload)) {
    return jsonRpcError(
      null,
      JSON_RPC_INVALID_REQUEST,
      "JSON-RPC batches are not supported",
      protocolHeader
    );
  }
  const parsed = jsonRpcRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonRpcError(
      null,
      JSON_RPC_INVALID_REQUEST,
      "Invalid request",
      protocolHeader
    );
  }
  if (parsed.data.id === undefined) {
    return accepted();
  }
  return dispatchRequest(
    parsed.data.method,
    parsed.data.params,
    parsed.data.id,
    request,
    dependencies,
    protocolHeader
  );
};
