import {
  agentRegistrationSkill,
  apiCatalogLinkset,
  jwksDocument,
  listwellOpenApiDocument,
  mcpServerCard,
  oauthAuthorizationServerMetadata,
  oauthProtectedResourceMetadata,
  openIdConfigurationMetadata,
} from "@/lib/agent-ready-metadata";
import {
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
} from "@/lib/polar";
import { listwellSiteUrl, robotsDirectives } from "@/lib/site-metadata";

export const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no";

const MARKDOWN_CHARS_PER_TOKEN = 4;

const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "Claude-Web",
  "ClaudeBot",
  "Google-Extended",
  "Amazonbot",
  "anthropic-ai",
  "Bytespider",
  "CCBot",
  "Applebot-Extended",
] as const;

const startListingAuditSkillBody = (origin: string): string =>
  `# Start a Listwell listing audit

Use this skill when someone wants to check local listings or website SEO with Listwell.

## What Listwell is

Listwell is a local and website SEO audit for small businesses at ${origin}. A visitor describes a business. Listwell matches Google Business Profile, Apple Maps, a website, and social profiles, then runs a free basic check. A full report with fix steps is ${REPORT_ONCE_PRICE} once. Continued reports are ${REPORT_MONTHLY_PRICE} or ${REPORT_YEARLY_PRICE} per business (${REPORT_YEARLY_VALUE_NOTE} on yearly).

obambulo studio owns Listwell. Discovery: \`${origin}/.well-known/api-catalog\`, WebMCP in the browser, and MCP server card at \`${origin}/.well-known/mcp/server-card.json\`. Session auth uses email OTP (see \`${origin}/auth.md\`).

## Start an audit

1. Open ${origin}/chat (or the home page and submit a business name)
2. Enter the business name
3. Confirm the area if asked
4. Pick the matching Google or Apple Maps listing, or paste a website URL
5. Confirm the category
6. Read the free basic report
7. Pay ${REPORT_ONCE_PRICE} if the visitor wants fix steps

Markdown versions of the public pages are available by sending \`Accept: text/markdown\`. Site overview: ${origin}/llms.txt

## Sign-in

Humans and agents use verified email OTP. Discovery metadata: \`${origin}/.well-known/oauth-authorization-server\` and \`${origin}/auth.md\`.

## Public HTTP API

Rate-limited \`/api/discover\`, \`/api/health\`, and \`/api/chat/interpret\` are listed in \`${origin}/.well-known/api-catalog\`. Business APIs require a session.

## Do not

- Do not scrape \`/account\` or private report pages.
- Do not bypass rate limits on public API routes.
`;

const bytesToHex = (bytes: Uint8Array): string => {
  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, "0"));
  }
  return hex.join("");
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return bytesToHex(new Uint8Array(digest));
};

export const markdownTokenCount = (body: string): number =>
  Math.max(1, Math.ceil(body.length / MARKDOWN_CHARS_PER_TOKEN));

const robotsGroup = (userAgent: string): string =>
  [
    `User-Agent: ${userAgent}`,
    "Allow: /",
    "Disallow: /account",
    "Disallow: /api/",
    `Content-Signal: ${CONTENT_SIGNAL}`,
  ].join("\n");

export const robotsTxt = (origin = listwellSiteUrl()): string => {
  const { host, sitemap } = robotsDirectives(origin);
  const groups = [
    robotsGroup("*"),
    ...AI_CRAWLER_USER_AGENTS.map((userAgent) => robotsGroup(userAgent)),
  ];

  return `${[
    "# Content Signals (https://contentsignals.org/)",
    "# search: build a search index and show results (not AI-generated summaries)",
    "# ai-input: use content as live input for AI answers (RAG, grounding)",
    "# ai-train: train or fine-tune AI models",
    "# yes = allowed for that use; no = not allowed for that use",
    "",
    groups.join("\n\n"),
    "",
    `Host: ${host}`,
    `Sitemap: ${sitemap}`,
    `Agentmap: ${origin}/.well-known/ai-catalog.json`,
  ].join("\n")}\n`;
};

export const llmsTxt = (origin = listwellSiteUrl()): string =>
  [
    "# Listwell",
    "",
    "> Local and website SEO audit for small businesses. Answer a few questions, get a basic report, then upgrade for fix steps and automation.",
    "",
    `Listwell matches a business to Google Business Profile, Apple Maps, a website, and social profiles, then checks local and website SEO. The home page chat runs a free basic check. A full report with fix steps is ${REPORT_ONCE_PRICE} once. Continued reports are ${REPORT_MONTHLY_PRICE} or ${REPORT_YEARLY_PRICE} per business (${REPORT_YEARLY_VALUE_NOTE} on yearly).`,
    "",
    "AI crawlers are allowed. Content-Signal: search=yes, ai-input=yes, ai-train=no.",
    "",
    "## Public pages",
    "",
    `- [Home](${origin}/): marketing and start link`,
    `- [Chat audit](${origin}/chat): run the listing check`,
    `- [Find your listing](${origin}/discover): match a business name to listings`,
    `- [Confirm listings](${origin}/new): confirm profiles before the report`,
    `- [Sign in](${origin}/sign-in): email one-time code, no password`,
    "",
    "## For agents",
    "",
    `- [Markdown pages](${origin}/): send Accept: text/markdown`,
    `- [auth.md](${origin}/auth.md): sign-in and agent registration`,
    `- [API catalog](${origin}/.well-known/api-catalog): RFC 9727 linkset for /api`,
    `- [OAuth AS metadata](${origin}/.well-known/oauth-authorization-server): email OTP session discovery`,
    `- [OAuth protected resource](${origin}/.well-known/oauth-protected-resource): /api resource identifier`,
    `- [MCP server card](${origin}/.well-known/mcp/server-card.json): MCP discovery (HTTP endpoint reserved)`,
    `- [robots.txt](${origin}/robots.txt): crawl rules and Content Signals`,
    `- [Sitemap](${origin}/sitemap.xml): public URLs`,
    `- [ARD catalog](${origin}/.well-known/ai-catalog.json): documentation the site publishes`,
    `- [Agent skill](${origin}/.well-known/agent-skills/index.json): start a listing audit`,
    "- DNS-AID: publish HTTPS/SVCB `_index._agents`, `_mcp._agents`, and `_a2a._agents` on the listwell.dev zone with DNSSEC enabled",
    "",
    "WebMCP tools (`start_listing_audit`, `discover_listings`, `listwell_health`) register on page load in supporting browsers.",
    "",
  ].join("\n");

export const authMd = (origin = listwellSiteUrl()): string =>
  [
    "# auth.md",
    "",
    "Audience: people and verified-email agents using Listwell at the origin below.",
    "",
    `Origin: ${origin}`,
    "",
    "## How to sign in",
    "",
    `1. Open ${origin}/sign-in`,
    "2. Enter an email address",
    "3. Submit the one-time code sent to that inbox",
    "",
    "There is no password. Better Auth on Convex issues the email code. Sessions are cookies on the Listwell site.",
    "",
    "## Verified email {#verified-email}",
    "",
    "Agents register with the verified email OTP flow:",
    "",
    `- Send code: \`POST ${origin}/api/auth/email-otp/send-verification-otp\` with JSON \`email\` and \`type: sign-in\`.`,
    `- Sign in: \`POST ${origin}/api/auth/sign-in/email-otp\` with JSON \`email\` and \`otp\`.`,
    "",
    "Machine-readable metadata:",
    "",
    `- \`${origin}/.well-known/oauth-authorization-server\` (includes \`agent_auth\`)`,
    `- \`${origin}/.well-known/oauth-protected-resource\` for \`${origin}/api\``,
    `- Agent registration skill: \`${origin}/.well-known/agent-skills/agent-registration/SKILL.md\``,
    "",
    "## Public API without a session",
    "",
    `Rate-limited routes are listed in the [API catalog](${origin}/.well-known/api-catalog). Business data under \`/api/businesses\` requires a session.`,
    "",
  ].join("\n");

export const startListingAuditSkill = (origin = listwellSiteUrl()): string =>
  startListingAuditSkillBody(origin);

const pageMarkdown = (origin: string): Record<string, string> => ({
  "/": [
    "# Listwell",
    "",
    "Local and website SEO audit for businesses.",
    "",
    `Listwell runs a free check of local and website visibility. A full report with fix steps is ${REPORT_ONCE_PRICE} once. Continued reports are ${REPORT_MONTHLY_PRICE} or ${REPORT_YEARLY_PRICE} per business (${REPORT_YEARLY_VALUE_NOTE} on yearly).`,
    "",
    "Enter a business name on this page or open the chat audit to look up map listings, a website, and social profiles, then see a basic report.",
    "",
    `- [Chat audit](${origin}/chat)`,
    "",
    "## Links",
    "",
    `- [Find your listing](${origin}/discover)`,
    `- [Confirm listings](${origin}/new)`,
    `- [Sign in](${origin}/sign-in)`,
    `- [llms.txt](${origin}/llms.txt)`,
    `- [auth.md](${origin}/auth.md)`,
    "",
  ].join("\n"),
  "/chat": [
    "# Check your listings",
    "",
    "Chat flow for a free local and website SEO audit.",
    "",
    "Enter a business name, confirm listings and category, then read the basic report.",
    "",
    `- [Home](${origin}/)`,
    "",
  ].join("\n"),
  "/discover": [
    "# Find your listing",
    "",
    "Match a business name to map listings, a website, and social profiles.",
    "",
    `Enter a business name on the [home page](${origin}/) to start an audit. This page shows listing candidates to confirm.`,
    "",
  ].join("\n"),
  "/new": [
    "# Confirm listings",
    "",
    "Confirm the business name, category, website, and listing profiles before Listwell runs the audit.",
    "",
    `Start from the [home page](${origin}/) if you do not already have a draft.`,
    "",
  ].join("\n"),
  "/sign-in": [
    "# Sign in",
    "",
    "Sign in with an email one-time code. There is no password and no OAuth.",
    "",
    `Details: ${origin}/auth.md`,
    "",
  ].join("\n"),
});

const normalizePath = (pathname: string): string => {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
};

export const markdownForPath = (
  pathname: string,
  origin = listwellSiteUrl()
): string | null => pageMarkdown(origin)[normalizePath(pathname)] ?? null;

export const prefersMarkdown = (acceptHeader: string | null): boolean => {
  if (!acceptHeader) {
    return false;
  }

  let markdownQ = 0;
  let htmlQ = 0;

  for (const part of acceptHeader.split(",")) {
    const segments = part.split(";").map((item) => item.trim());
    const [mediaType] = segments;
    if (!mediaType) {
      continue;
    }

    let qParameter: string | undefined;
    for (const parameter of segments) {
      if (parameter.startsWith("q=")) {
        qParameter = parameter;
        break;
      }
    }
    const quality = qParameter ? Number(qParameter.slice(2)) : 1;
    if (!Number.isFinite(quality) || quality <= 0) {
      continue;
    }

    if (mediaType === "text/markdown") {
      markdownQ = Math.max(markdownQ, quality);
    }
    if (mediaType === "text/html") {
      htmlQ = Math.max(htmlQ, quality);
    }
  }

  return markdownQ > 0 && markdownQ >= htmlQ;
};

export const agentLinkHeaderValues = (origin = listwellSiteUrl()): string[] => [
  `<${origin}/llms.txt>; rel="describedby"; type="text/markdown"`,
  `<${origin}/llms.txt>; rel="service-doc"; type="text/markdown"`,
  `<${origin}/auth.md>; rel="describedby"; type="text/markdown"`,
  `<${origin}/.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"`,
  `<${origin}/.well-known/ai-catalog.json>; rel="describedby"; type="application/json"`,
  `<${origin}/.well-known/ai-catalog.json>; rel="ard"; type="application/json"`,
];

export const appendAgentLinkHeaders = (
  headers: Headers,
  origin = listwellSiteUrl()
): void => {
  for (const value of agentLinkHeaderValues(origin)) {
    headers.append("Link", value);
  }
};

export const appendAcceptVary = (headers: Headers): void => {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", "Accept");
    return;
  }
  const parts = existing.split(",").map((part) => part.trim().toLowerCase());
  if (!parts.includes("accept")) {
    headers.set("Vary", `${existing}, Accept`);
  }
};

interface DiscoveryDocument {
  body: string;
  contentType: string;
}

const jsonDocument = (value: unknown): DiscoveryDocument => ({
  body: `${JSON.stringify(value, null, 2)}\n`,
  contentType: "application/json; charset=utf-8",
});

const linksetDocument = (value: unknown): DiscoveryDocument => ({
  body: `${JSON.stringify(value, null, 2)}\n`,
  contentType: "application/linkset+json; charset=utf-8",
});

export const ardCatalog = (origin = listwellSiteUrl()) => ({
  entries: [
    {
      description:
        "Markdown overview of Listwell for agents, API catalog, and WebMCP tools.",
      displayName: "Listwell documentation index",
      identifier: "urn:air:listwell.dev:docs:llms",
      representativeQueries: [
        "what is Listwell",
        "how do I start a listing audit",
        "does Listwell have a public API",
      ],
      type: "text/markdown",
      url: `${origin}/llms.txt`,
    },
    {
      description:
        "Email one-time code sign-in. Listwell does not offer OAuth or agent registration.",
      displayName: "Listwell sign-in",
      identifier: "urn:air:listwell.dev:docs:auth",
      representativeQueries: [
        "how do I sign in to Listwell",
        "does Listwell support OAuth",
      ],
      type: "text/markdown",
      url: `${origin}/auth.md`,
    },
    {
      description: "Skills for running a Listwell listing audit in a browser.",
      displayName: "Listwell agent skills",
      identifier: "urn:air:listwell.dev:skills:index",
      representativeQueries: [
        "audit a local business with Listwell",
        "check Google listing SEO",
      ],
      type: "application/json",
      url: `${origin}/.well-known/agent-skills/index.json`,
    },
  ],
  host: {
    displayName: "Listwell",
    identifier: "did:web:listwell.dev",
  },
  specVersion: "1.0",
});

export const agentSkillsIndex = async (origin = listwellSiteUrl()) => {
  const skill = startListingAuditSkill(origin);
  const digest = await sha256Hex(skill);
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        description:
          "Start a Listwell local and website SEO audit from the public chat. Use when a user wants listing or website visibility checked.",
        digest: `sha256:${digest}`,
        name: "start-listing-audit",
        type: "skill-md",
        url: `${origin}/.well-known/agent-skills/start-listing-audit/SKILL.md`,
      },
    ],
  };
};

export const discoveryDocument = async (
  pathname: string,
  origin = listwellSiteUrl()
): Promise<DiscoveryDocument | null> => {
  const path = normalizePath(pathname);

  if (path === "/robots.txt") {
    return {
      body: robotsTxt(origin),
      contentType: "text/plain; charset=utf-8",
    };
  }
  if (path === "/llms.txt") {
    return {
      body: llmsTxt(origin),
      contentType: "text/plain; charset=utf-8",
    };
  }
  if (path === "/auth.md") {
    return {
      body: authMd(origin),
      contentType: "text/markdown; charset=utf-8",
    };
  }
  if (
    path === "/.well-known/ai-catalog.json" ||
    path === "/.well-known/ard.json"
  ) {
    return jsonDocument(ardCatalog(origin));
  }
  if (path === "/.well-known/agent-skills/index.json") {
    return jsonDocument(await agentSkillsIndex(origin));
  }
  if (path === "/.well-known/agent-skills/start-listing-audit/SKILL.md") {
    return {
      body: startListingAuditSkill(origin),
      contentType: "text/markdown; charset=utf-8",
    };
  }
  if (path === "/.well-known/agent-skills/agent-registration/SKILL.md") {
    return {
      body: agentRegistrationSkill(origin),
      contentType: "text/markdown; charset=utf-8",
    };
  }
  if (path === "/.well-known/api-catalog") {
    return linksetDocument(apiCatalogLinkset(origin));
  }
  if (path === "/.well-known/openapi.json") {
    return jsonDocument(listwellOpenApiDocument(origin));
  }
  if (
    path === "/.well-known/oauth-authorization-server" ||
    path === "/.well-known/openid-configuration"
  ) {
    const metadata =
      path === "/.well-known/openid-configuration"
        ? openIdConfigurationMetadata(origin)
        : oauthAuthorizationServerMetadata(origin);
    return jsonDocument(metadata);
  }
  if (path === "/.well-known/oauth-protected-resource") {
    return jsonDocument(oauthProtectedResourceMetadata(origin));
  }
  if (path === "/.well-known/jwks.json") {
    return jsonDocument(jwksDocument());
  }
  if (path === "/.well-known/mcp/server-card.json") {
    return jsonDocument(mcpServerCard(origin));
  }
  return null;
};

export const isApiPath = (pathname: string): boolean =>
  pathname === "/api" || pathname.startsWith("/api/");

export const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

export const markdownResponseHeaders = (body: string): Headers => {
  const headers = new Headers({
    "Cache-Control": "public, max-age=300",
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Markdown-Tokens": String(markdownTokenCount(body)),
    ...corsHeaders,
  });
  appendAcceptVary(headers);
  return headers;
};

const requestOrigin = (url: URL): string => url.origin;

export const agentReadyResponse = async (
  request: Request
): Promise<Response | null> => {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    return null;
  }

  const url = new URL(request.url);
  const origin = requestOrigin(url);
  const document = await discoveryDocument(url.pathname, origin);

  if (document) {
    const headers = new Headers({
      "Cache-Control": "public, max-age=300",
      "Content-Type": document.contentType,
      ...corsHeaders,
    });
    appendAgentLinkHeaders(headers, origin);
    if (document.contentType.startsWith("text/markdown")) {
      headers.set(
        "X-Markdown-Tokens",
        String(markdownTokenCount(document.body))
      );
    }
    if (method === "OPTIONS") {
      return new Response(null, { headers, status: 204 });
    }
    return new Response(method === "HEAD" ? null : document.body, {
      headers,
      status: 200,
    });
  }

  if (method === "OPTIONS" || isApiPath(url.pathname)) {
    return null;
  }

  if (!prefersMarkdown(request.headers.get("Accept"))) {
    return null;
  }

  const markdown = markdownForPath(url.pathname, origin);
  if (!markdown) {
    return null;
  }

  const headers = markdownResponseHeaders(markdown);
  appendAgentLinkHeaders(headers, origin);
  return new Response(method === "HEAD" ? null : markdown, {
    headers,
    status: 200,
  });
};

export const agentDocumentRoute = async (
  request: Request
): Promise<Response> => {
  const response = await agentReadyResponse(request);
  if (response) {
    return response;
  }
  return new Response("Not found\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 404,
  });
};
