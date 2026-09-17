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

const START_LISTING_AUDIT_SKILL = `# Start a Listwell listing audit

Use this skill when someone wants to check local listings or website SEO with Listwell.

## What Listwell is

Listwell is a chat-first local and website SEO audit at https://listwell.dev. A visitor describes a business. Listwell matches listings, a website, and social profiles, then runs a free basic check. A full report with fix steps is $5. Monthly scans are $9.

Obambulo Studio owns Listwell. There is no public MCP server, A2A agent, or OAuth API.

## Start an audit

1. Open https://listwell.dev
2. Enter the business name
3. Confirm the area if asked
4. Pick the matching Google or Apple Maps listing, or paste a website URL
5. Confirm the category
6. Read the free basic report
7. Pay $5 if the visitor wants fix steps

Markdown versions of the public pages are available by sending \`Accept: text/markdown\`. Site overview: https://listwell.dev/llms.txt

## Sign-in

Humans sign in with an email one-time code at https://listwell.dev/sign-in. There is no password and no OAuth authorization server for agents. See https://listwell.dev/auth.md

## Do not

- Do not treat \`/api/*\` as a public machine API. Those routes are for the signed-in product and internal jobs.
- Do not invent OAuth, MCP, or A2A endpoints for this host.
- Do not scrape \`/account\` or private report pages.
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
    "> Chat-first local and website SEO audit. Answer a few questions, get a basic report, then upgrade for fixes and automation.",
    "",
    "Listwell matches a business to map listings, a website, and social profiles, then checks local and website SEO. The home page chat runs a free basic check. A full report with fix steps is $5. Monthly scans are $9.",
    "",
    "AI crawlers are allowed. Content-Signal: search=yes, ai-input=yes, ai-train=no.",
    "",
    "## Public pages",
    "",
    `- [Home](${origin}/): start an audit in chat`,
    `- [Find your listing](${origin}/discover): match a business name to listings`,
    `- [Confirm listings](${origin}/new): confirm profiles before the report`,
    `- [Sign in](${origin}/sign-in): email one-time code, no password`,
    "",
    "## For agents",
    "",
    `- [Markdown pages](${origin}/): send Accept: text/markdown`,
    `- [auth.md](${origin}/auth.md): how sign-in works (no OAuth)`,
    `- [robots.txt](${origin}/robots.txt): crawl rules and Content Signals`,
    `- [Sitemap](${origin}/sitemap.xml): public URLs`,
    `- [ARD catalog](${origin}/.well-known/ai-catalog.json): documentation the site actually publishes`,
    `- [Agent skill](${origin}/.well-known/agent-skills/index.json): start a listing audit`,
    "",
    "## Not available",
    "",
    "Listwell does not publish a public HTTP API catalog, MCP server, A2A agent card, or OAuth authorization server. Product APIs under /api/ are for the web app and require a session.",
    "",
  ].join("\n");

export const authMd = (origin = listwellSiteUrl()): string =>
  [
    "# auth.md",
    "",
    "Listwell does not offer OAuth 2.0, OIDC, or agent client registration.",
    "",
    "Audience: people using the Listwell web app at the origin below.",
    "",
    `Origin: ${origin}`,
    "",
    "## How to sign in",
    "",
    `1. Open ${origin}/sign-in`,
    "2. Enter an email address",
    "3. Submit the one-time code sent to that inbox",
    "",
    "There is no password. Better Auth on Convex issues the email code. Sessions are cookies on the Listwell site, not bearer tokens for a public API.",
    "",
    "## What is not provided",
    "",
    "- No `/.well-known/oauth-authorization-server`",
    "- No `/.well-known/oauth-protected-resource`",
    "- No MCP OAuth resource",
    "- No agent registration URI",
    "",
    "If you need a listing audit, use the public chat at the origin. Do not call `/api/*` as a machine API.",
    "",
  ].join("\n");

export const startListingAuditSkill = (): string => START_LISTING_AUDIT_SKILL;

const pageMarkdown = (origin: string): Record<string, string> => ({
  "/": [
    "# Listwell",
    "",
    "Chat-first local and website SEO audit.",
    "",
    "Listwell runs a free check of local and website visibility. A full report with fix steps is $5. Monthly scans are $9.",
    "",
    "Start on this page by entering a business name. Listwell looks up map listings, a website, and social profiles, then shows a basic report.",
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

    const qParameter = segments.find((parameter) => parameter.startsWith("q="));
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

export const ardCatalog = (origin = listwellSiteUrl()) => ({
  entries: [
    {
      description:
        "Markdown overview of Listwell for agents. No public MCP or OAuth API.",
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
  const skill = startListingAuditSkill();
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
      body: startListingAuditSkill(),
      contentType: "text/markdown; charset=utf-8",
    };
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
