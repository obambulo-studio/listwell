import { z } from "zod";

import { listwellSiteUrl } from "@/lib/site-metadata";

const linksetHrefSchema = z.object({
  href: z.url(),
  type: z.string().optional(),
});

const apiCatalogSchema = z.object({
  linkset: z
    .array(
      z
        .object({
          anchor: z.url(),
          "service-desc": z.array(linksetHrefSchema).optional(),
          "service-doc": z.array(linksetHrefSchema).optional(),
          status: z.array(linksetHrefSchema).optional(),
        })
        .passthrough()
    )
    .min(1),
});

const oauthAuthorizationServerSchema = z
  .object({
    agent_auth: z.object({
      identity_assertion: z.object({
        assertion_types_supported: z.array(z.string()).min(1),
        credential_types_supported: z.array(z.string()).min(1),
      }),
      identity_types_supported: z.array(z.string()).min(1),
      register_uri: z.url(),
      skill: z.url(),
      verified_email: z.object({
        claim_uri: z.url(),
        credential_types_supported: z.array(z.string()).min(1),
      }),
    }),
    authorization_endpoint: z.url(),
    code_challenge_methods_supported: z.array(z.string()).min(1),
    grant_types_supported: z.array(z.string()).min(1),
    issuer: z.url(),
    jwks_uri: z.url(),
    response_types_supported: z.array(z.string()).min(1),
    token_endpoint: z.url(),
  })
  .passthrough();

const oauthProtectedResourceSchema = z.object({
  authorization_servers: z.array(z.url()).min(1),
  bearer_methods_supported: z.array(z.literal("header")),
  resource: z.url(),
  scopes_supported: z.array(z.string()).min(1),
});

const jwksSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown())),
});

const mcpServerCardSchema = z.object({
  capabilities: z.object({
    tools: z.boolean(),
  }),
  description: z.string().min(1),
  serverInfo: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  transport: z.object({
    type: z.literal("streamable-http"),
  }),
  url: z.url(),
});

const LISTWELL_MCP_VERSION = "1.0.0";

const listwellAuthIssuer = (origin: string): string => origin;

const listwellAuthPaths = (origin: string) => ({
  authorizationEndpoint: `${origin}/sign-in`,
  emailOtpSend: `${origin}/api/auth/email-otp/send-verification-otp`,
  emailOtpSignIn: `${origin}/api/auth/sign-in/email-otp`,
  jwksUri: `${origin}/.well-known/jwks.json`,
});

export const listwellOpenApiDocument = (origin = listwellSiteUrl()) => ({
  info: {
    description:
      "Rate-limited HTTP endpoints used by the Listwell web app and browser agents. Session cookies from Better Auth are required for business APIs under /api/businesses.",
    title: "Listwell public HTTP API",
    version: LISTWELL_MCP_VERSION,
  },
  openapi: "3.1.0",
  paths: {
    "/api/chat/interpret": {
      post: {
        description:
          "Interpret free-text chat input during the listing audit onboarding flow.",
        operationId: "interpretChatInput",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,
                properties: {
                  draft: { type: "object" },
                  phase: { type: "string" },
                  text: { maxLength: 4000, minLength: 1, type: "string" },
                },
                required: ["draft", "phase", "text"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: {
          "200": {
            description: "Interpretation result",
          },
          "429": {
            description: "Rate limited",
          },
        },
      },
    },
    "/api/discover": {
      post: {
        description:
          "Search map listings, websites, and social profiles for a business name.",
        operationId: "discoverBusiness",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,
                properties: {
                  businessName: { minLength: 1, type: "string" },
                  near: { type: "string" },
                  websiteUrl: { type: "string" },
                },
                required: ["businessName"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: {
          "200": {
            description: "Listing candidates and profiles",
          },
          "400": {
            description: "Invalid request",
          },
          "429": {
            description: "Rate limited",
          },
        },
      },
    },
    "/api/health": {
      get: {
        description: "Dependency and storage health for the audit engine.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Health snapshot",
          },
        },
      },
    },
  },
  servers: [{ url: origin }],
});

export const apiCatalogLinkset = (origin = listwellSiteUrl()) => {
  const openApiHref = `${origin}/.well-known/openapi.json`;
  const value = apiCatalogSchema.parse({
    linkset: [
      {
        anchor: `${origin}/api`,
        "service-desc": [
          {
            href: openApiHref,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${origin}/llms.txt`,
            type: "text/plain",
          },
        ],
        status: [
          {
            href: `${origin}/api/health`,
            type: "application/json",
          },
        ],
      },
      {
        anchor: `${origin}/mcp`,
        "service-desc": [
          {
            href: `${origin}/.well-known/mcp/server-card.json`,
            type: "application/json",
          },
        ],
      },
    ],
  });
  return value;
};

export const oauthAuthorizationServerMetadata = (
  origin = listwellSiteUrl()
) => {
  const issuer = listwellAuthIssuer(origin);
  const paths = listwellAuthPaths(origin);
  return oauthAuthorizationServerSchema.parse({
    agent_auth: {
      identity_assertion: {
        assertion_types_supported: ["verified_email"],
        credential_types_supported: ["email_otp"],
      },
      identity_types_supported: ["identity_assertion"],
      register_uri: paths.emailOtpSend,
      skill: `${origin}/.well-known/agent-skills/agent-registration/SKILL.md`,
      verified_email: {
        claim_uri: `${origin}/auth.md#verified-email`,
        credential_types_supported: ["email_otp"],
      },
    },
    authorization_endpoint: paths.authorizationEndpoint,
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    issuer,
    jwks_uri: paths.jwksUri,
    response_types_supported: ["code"],
    token_endpoint: paths.emailOtpSignIn,
  });
};

export const openIdConfigurationMetadata = (origin = listwellSiteUrl()) => {
  const oauth = oauthAuthorizationServerMetadata(origin);
  return {
    ...oauth,
    id_token_signing_alg_values_supported: ["RS256"],
    subject_types_supported: ["public"],
  };
};

export const oauthProtectedResourceMetadata = (origin = listwellSiteUrl()) => {
  const issuer = listwellAuthIssuer(origin);
  return oauthProtectedResourceSchema.parse({
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    resource: `${origin}/api`,
    scopes_supported: ["businesses:read", "businesses:write", "account:read"],
  });
};

export const jwksDocument = () => jwksSchema.parse({ keys: [] });

export const mcpServerCard = (origin = listwellSiteUrl()) =>
  mcpServerCardSchema.parse({
    capabilities: {
      tools: true,
    },
    description:
      "Listwell listing and website SEO audits for small businesses. Prefer WebMCP tools in the browser; streamable HTTP MCP is reserved for future automation.",
    serverInfo: {
      name: "Listwell",
      version: LISTWELL_MCP_VERSION,
    },
    transport: {
      type: "streamable-http",
    },
    url: `${origin}/mcp`,
  });

export const agentRegistrationSkill = (origin = listwellSiteUrl()): string =>
  [
    "# Register a Listwell agent session",
    "",
    "Use this skill when an automated client needs a human-verified Listwell account.",
    "",
    "## Flow (verified email)",
    "",
    "1. `POST` " +
      `\`${origin}/api/auth/email-otp/send-verification-otp\`` +
      ' with JSON `{ "email": "user@example.com", "type": "sign-in" }`.',
    "2. Collect the one-time code from the user's inbox (out of band).",
    "3. `POST` " +
      `\`${origin}/api/auth/sign-in/email-otp\`` +
      ' with JSON `{ "email": "user@example.com", "otp": "123456" }`.',
    "4. Store session cookies returned by Better Auth for subsequent `/api/businesses` calls.",
    "",
    "## Metadata",
    "",
    `- Protected resource: \`${origin}/.well-known/oauth-protected-resource\``,
    `- Authorization server: \`${origin}/.well-known/oauth-authorization-server\``,
    `- Human-readable policy: \`${origin}/auth.md\``,
    "",
  ].join("\n");
