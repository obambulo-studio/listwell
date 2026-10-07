import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { handleMcpPost } from "./mcp-http";
import type { McpDependencies } from "./mcp-http";

const jsonRpcResponseSchema = z.object({
  error: z
    .object({
      code: z.number(),
      message: z.string(),
    })
    .optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  jsonrpc: z.literal("2.0"),
  result: z.unknown().optional(),
});

const toolListSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
    })
  ),
});

const toolCallSchema = z.object({
  content: z.array(
    z.object({
      text: z.string(),
      type: z.literal("text"),
    })
  ),
  isError: z.boolean(),
});

const mcpRequest = (body: unknown, headers?: Record<string, string>): Request =>
  new Request("https://listwell.dev/mcp", {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });

const dependencies = (): McpDependencies => ({
  discoverListings: vi.fn<McpDependencies["discoverListings"]>(),
  getBusinessReport: vi.fn<McpDependencies["getBusinessReport"]>(),
  listMyBusinesses: vi.fn<McpDependencies["listMyBusinesses"]>(),
  readHealth: vi.fn<McpDependencies["readHealth"]>(),
  resolveAgentUser: vi.fn<McpDependencies["resolveAgentUser"]>(),
  runListingAudit: vi.fn<McpDependencies["runListingAudit"]>(),
});

const readJson = async (response: Response) => {
  const payload: unknown = await response.json();
  return jsonRpcResponseSchema.parse(payload);
};

describe(handleMcpPost, () => {
  it("rejects browser origins that are not Listwell", async () => {
    const response = await handleMcpPost(
      mcpRequest(
        { id: 1, jsonrpc: "2.0", method: "ping" },
        { Origin: "https://evil.example" }
      ),
      dependencies()
    );
    expect(response.status).toBe(403);
  });

  it("requires both streamable HTTP accept types", async () => {
    const response = await handleMcpPost(
      mcpRequest(
        { id: 1, jsonrpc: "2.0", method: "ping" },
        { Accept: "application/json" }
      ),
      dependencies()
    );
    expect(response.status).toBe(406);
  });

  it("negotiates initialize and advertises MCP tools", async () => {
    const response = await handleMcpPost(
      mcpRequest({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
          protocolVersion: "2025-11-25",
        },
      }),
      dependencies()
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("MCP-Protocol-Version")).toBe("2025-11-25");
    const body = await readJson(response);
    const result = z
      .object({
        instructions: z.string(),
        protocolVersion: z.literal("2025-11-25"),
        serverInfo: z.object({ name: z.literal("Listwell") }),
      })
      .parse(body.result);
    expect(result.instructions).toContain("run_listing_audit");
  });

  it("lists MCP tools", async () => {
    const response = await handleMcpPost(
      mcpRequest({ id: 2, jsonrpc: "2.0", method: "tools/list" }),
      dependencies()
    );
    const body = await readJson(response);
    const listed = toolListSchema.parse(body.result);
    expect(listed.tools.map((tool) => tool.name)).toStrictEqual([
      "discover_listings",
      "listwell_health",
      "run_listing_audit",
      "list_my_businesses",
      "get_business_report",
    ]);
  });

  it("calls listwell_health", async () => {
    const deps = dependencies();
    (deps.readHealth as Mock).mockResolvedValue({ ok: true });
    const response = await handleMcpPost(
      mcpRequest({
        id: 3,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "listwell_health" },
      }),
      deps
    );
    const body = await readJson(response);
    const result = toolCallSchema.parse(body.result);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('"ok": true');
  });

  it("calls discover_listings with the rate-limited dependency", async () => {
    const deps = dependencies();
    (deps.discoverListings as Mock).mockResolvedValue({
      body: { candidates: [] },
      ok: true,
    });
    const response = await handleMcpPost(
      mcpRequest({
        id: 4,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { businessName: "  Cafe  ", near: " Sydney " },
          name: "discover_listings",
        },
      }),
      deps
    );
    expect(deps.discoverListings).toHaveBeenCalledWith(
      { businessName: "Cafe", near: "Sydney" },
      expect.any(Request)
    );
    const body = await readJson(response);
    expect(toolCallSchema.parse(body.result).isError).toBeFalsy();
  });

  it("returns a tool error when discover is rate limited", async () => {
    const deps = dependencies();
    (deps.discoverListings as Mock).mockResolvedValue({
      error: "Too many requests. Try again soon.",
      ok: false,
      status: 429,
    });
    const response = await handleMcpPost(
      mcpRequest({
        id: 5,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { businessName: "Cafe" },
          name: "discover_listings",
        },
      }),
      deps
    );
    const body = await readJson(response);
    const result = toolCallSchema.parse(body.result);
    expect(result.isError).toBeTruthy();
    expect(result.content[0]?.text).toBe("Too many requests. Try again soon.");
  });

  it("returns candidates when run_listing_audit needs confirmation", async () => {
    const deps = dependencies();
    (deps.runListingAudit as Mock).mockResolvedValue({
      body: {
        candidates: [{ candidateId: "google:1", name: "Cafe" }],
        message: "pick one",
        needsConfirmation: true,
      },
      ok: true,
    });
    const response = await handleMcpPost(
      mcpRequest({
        id: 8,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { businessName: "Cafe" },
          name: "run_listing_audit",
        },
      }),
      deps
    );
    const body = await readJson(response);
    const result = toolCallSchema.parse(body.result);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("needsConfirmation");
  });

  it("rejects keyed tools without an API key", async () => {
    const deps = dependencies();
    (deps.resolveAgentUser as Mock).mockResolvedValue(null);
    const response = await handleMcpPost(
      mcpRequest({
        id: 9,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "list_my_businesses" },
      }),
      deps
    );
    const body = await readJson(response);
    const result = toolCallSchema.parse(body.result);
    expect(result.isError).toBeTruthy();
    expect(result.content[0]?.text).toContain("API key");
  });

  it("rejects unknown tools", async () => {
    const response = await handleMcpPost(
      mcpRequest({
        id: 6,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "start_listing_audit" },
      }),
      dependencies()
    );
    const body = await readJson(response);
    expect(body.error?.message).toBe("Unknown tool: start_listing_audit");
  });

  it("accepts notifications without a body", async () => {
    const response = await handleMcpPost(
      mcpRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      dependencies()
    );
    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe("");
  });

  it("rejects an unsupported protocol header", async () => {
    const response = await handleMcpPost(
      mcpRequest(
        { id: 7, jsonrpc: "2.0", method: "ping" },
        { "MCP-Protocol-Version": "1999-01-01" }
      ),
      dependencies()
    );
    expect(response.status).toBe(400);
  });
});
