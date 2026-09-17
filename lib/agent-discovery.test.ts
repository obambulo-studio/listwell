import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  agentDocumentRoute,
  agentLinkHeaderValues,
  agentReadyResponse,
  agentSkillsIndex,
  appendAcceptVary,
  ardCatalog,
  authMd,
  CONTENT_SIGNAL,
  discoveryDocument,
  llmsTxt,
  markdownForPath,
  markdownTokenCount,
  prefersMarkdown,
  robotsTxt,
  sha256Hex,
  startListingAuditSkill,
} from "./agent-discovery";

const origin = "https://listwell.dev";

const skillIndexSchema = z.object({
  $schema: z.literal(
    "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
  ),
  skills: z
    .array(
      z.object({
        description: z.string().min(1),
        digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        name: z.string().min(1),
        type: z.literal("skill-md"),
        url: z.url(),
      })
    )
    .min(1),
});

const ardSchema = z.object({
  entries: z
    .array(
      z.object({
        displayName: z.string().min(1),
        identifier: z.string().regex(/^urn:air:listwell\.dev:/u),
        representativeQueries: z.array(z.string()).min(2).max(5),
        type: z.string().min(1),
        url: z.url(),
      })
    )
    .min(1),
  host: z.object({
    displayName: z.literal("Listwell"),
    identifier: z.literal("did:web:listwell.dev"),
  }),
  specVersion: z.literal("1.0"),
});

describe("agent discovery", () => {
  describe(robotsTxt, () => {
    it("declares Content Signals and allows AI crawlers", () => {
      const body = robotsTxt(origin);
      expect(body).toContain(`Content-Signal: ${CONTENT_SIGNAL}`);
      expect(body).toContain("User-Agent: GPTBot");
      expect(body).toContain("Allow: /");
      expect(body).toContain("Disallow: /api/");
    });

    it("points crawlers at the sitemap and ARD catalog", () => {
      const body = robotsTxt(origin);
      expect(body).toContain("User-Agent: *");
      expect(body).toContain("Sitemap: https://listwell.dev/sitemap.xml");
      expect(body).toContain(
        "Agentmap: https://listwell.dev/.well-known/ai-catalog.json"
      );
    });
  });

  describe(prefersMarkdown, () => {
    it("matches a markdown Accept header", () => {
      expect(prefersMarkdown("text/markdown")).toBeTruthy();
      expect(prefersMarkdown("text/markdown, text/html;q=0.9")).toBeTruthy();
    });

    it("leaves browsers on HTML", () => {
      expect(
        prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9")
      ).toBeFalsy();
      expect(prefersMarkdown(null)).toBeFalsy();
      expect(prefersMarkdown("text/markdown;q=0")).toBeFalsy();
    });
  });

  describe(markdownForPath, () => {
    it("covers the public marketing pages", () => {
      expect(markdownForPath("/", origin)).toContain("# Listwell");
      expect(markdownForPath("/discover", origin)).toContain(
        "# Find your listing"
      );
      expect(markdownForPath("/new/", origin)).toContain("# Confirm listings");
      expect(markdownForPath("/account", origin)).toBeNull();
    });
  });

  describe(agentLinkHeaderValues, () => {
    it("uses agent-useful relation types", () => {
      const values = agentLinkHeaderValues(origin).join(" ");
      expect(values).toContain('rel="describedby"');
      expect(values).toContain('rel="service-doc"');
      expect(values).toContain("/llms.txt");
    });
  });

  describe(appendAcceptVary, () => {
    it("adds Accept without duplicating it", () => {
      const headers = new Headers({ Vary: "rsc" });
      appendAcceptVary(headers);
      appendAcceptVary(headers);
      expect(headers.get("Vary")).toBe("rsc, Accept");
    });
  });

  describe("well-known documents", () => {
    it("publishes an honest ARD catalog without MCP or OAuth", () => {
      const catalog = ardSchema.parse(ardCatalog(origin));
      const serialized = JSON.stringify(catalog);
      expect(serialized).not.toContain("mcp");
      expect(serialized).not.toContain("oauth");
    });

    it("hashes the listing-audit skill into the index", async () => {
      const index = skillIndexSchema.parse(await agentSkillsIndex(origin));
      const [skill] = index.skills;
      if (!skill) {
        throw new Error("expected a skill");
      }
      expect(skill.digest).toBe(
        `sha256:${await sha256Hex(startListingAuditSkill())}`
      );
    });

    it("describes email OTP sign-in in auth.md", () => {
      expect(authMd(origin)).toMatch(/^# auth\.md/u);
      expect(authMd(origin)).toContain("does not offer OAuth");
    });

    it("introduces the product in llms.txt", () => {
      expect(llmsTxt(origin)).toMatch(/^# Listwell/u);
      expect(llmsTxt(origin)).toContain(
        "does not publish a public HTTP API catalog"
      );
    });
  });

  describe(agentReadyResponse, () => {
    it("serves robots.txt with Content-Signal", async () => {
      const response = await agentReadyResponse(
        new Request("https://listwell.dev/robots.txt")
      );
      if (!response) {
        throw new Error("expected robots.txt");
      }
      expect(response.headers.get("Content-Type")).toContain("text/plain");
      await expect(response.text()).resolves.toContain("Content-Signal:");
    });

    it("negotiates markdown on the homepage", async () => {
      const response = await agentReadyResponse(
        new Request("https://listwell.dev/", {
          headers: { Accept: "text/markdown" },
        })
      );
      if (!response) {
        throw new Error("expected markdown");
      }
      expect(response.headers.get("Content-Type")).toContain("text/markdown");
      expect(response.headers.get("X-Markdown-Tokens")).toBe(
        String(markdownTokenCount(markdownForPath("/", origin) ?? ""))
      );
      expect(response.headers.get("Link")).toContain('rel="describedby"');
      await expect(response.text()).resolves.toContain("# Listwell");
    });

    it("does not negotiate markdown for HTML browsers", async () => {
      const response = await agentReadyResponse(
        new Request("https://listwell.dev/", {
          headers: {
            Accept: "text/html,application/xhtml+xml",
          },
        })
      );
      expect(response).toBeNull();
    });

    it("serves the ARD catalog and skills index", async () => {
      const catalog = await agentReadyResponse(
        new Request("https://listwell.dev/.well-known/ai-catalog.json")
      );
      const skills = await agentReadyResponse(
        new Request("https://listwell.dev/.well-known/agent-skills/index.json")
      );
      if (!catalog || !skills) {
        throw new Error("expected well-known documents");
      }
      expect(catalog.headers.get("Access-Control-Allow-Origin")).toBe("*");
      const catalogBody: unknown = JSON.parse(await catalog.text());
      const skillsBody: unknown = JSON.parse(await skills.text());
      ardSchema.parse(catalogBody);
      skillIndexSchema.parse(skillsBody);
    });
  });

  describe(discoveryDocument, () => {
    it("aliases ard.json to the same catalog", async () => {
      const catalog = await discoveryDocument(
        "/.well-known/ai-catalog.json",
        origin
      );
      const alias = await discoveryDocument("/.well-known/ard.json", origin);
      expect(catalog?.body).toBe(alias?.body);
    });
  });

  describe(agentDocumentRoute, () => {
    it("returns 404 for unknown discovery paths", async () => {
      const response = await agentDocumentRoute(
        new Request("https://listwell.dev/.well-known/missing.json")
      );
      expect(response.status).toBe(404);
    });
  });
});
