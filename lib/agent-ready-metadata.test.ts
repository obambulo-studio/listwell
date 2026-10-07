import { describe, expect, it } from "vitest";

import {
  apiCatalogLinkset,
  jwksDocument,
  mcpServerCard,
  oauthAuthorizationServerMetadata,
  oauthProtectedResourceMetadata,
} from "./agent-ready-metadata";

const origin = "https://listwell.dev";

describe("agent-ready metadata", () => {
  it("publishes an RFC 9727 API catalog linkset", () => {
    const catalog = apiCatalogLinkset(origin);
    expect(catalog.linkset.length).toBeGreaterThanOrEqual(2);
    const apiEntry = catalog.linkset.find(
      (entry) => entry.anchor === `${origin}/api`
    );
    expect(apiEntry?.["service-desc"]?.[0]?.href).toBe(
      `${origin}/.well-known/openapi.json`
    );
    expect(apiEntry?.status?.[0]?.href).toBe(`${origin}/api/health`);
  });

  it("aligns OAuth issuer with protected resource authorization_servers", () => {
    const asMetadata = oauthAuthorizationServerMetadata(origin);
    const prm = oauthProtectedResourceMetadata(origin);
    expect(prm.authorization_servers[0]).toBe(asMetadata.issuer);
    expect(prm.resource).toBe(origin);
    expect(asMetadata.agent_auth.skill).toBe(`${origin}/auth.md`);
    expect(asMetadata.agent_auth.register_uri).toBe(
      `${origin}/api/agent/register`
    );
    expect(asMetadata.agent_auth.claim_uri).toBe(`${origin}/api/agent/claim`);
  });

  it("supports anonymous agent identity", () => {
    const asMetadata = oauthAuthorizationServerMetadata(origin);
    expect(asMetadata.agent_auth.identity_types_supported).toStrictEqual([
      "anonymous",
    ]);
  });

  it("includes MCP server card transport and tools capability", () => {
    const card = mcpServerCard(origin);
    expect(card.serverInfo.name).toBe("Listwell");
    expect(card.url).toBe(`${origin}/mcp`);
    expect(card.capabilities.tools).toBeTruthy();
    expect(card.description).toContain("run_listing_audit");
  });

  it("serves an empty JWKS document", () => {
    expect(jwksDocument().keys).toStrictEqual([]);
  });
});
