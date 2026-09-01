import { DOMParser } from "linkedom/worker";
import { z } from "zod";

export type HtmlElement = {
  textContent: string | null;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => HtmlElement[];
  remove: () => void;
};

export type HtmlDocument = {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => HtmlElement[];
  body: HtmlElement | null;
};

export type WebsiteSnapshot = {
  url: string;
  html: string;
  status: number;
  statusText: string;
  ok: boolean;
  finalUrl: string;
  document: HtmlDocument;
};

const snapshotCache = new Map<string, { snapshot: WebsiteSnapshot; expires: number }>();
const CACHE_MS = 1000 * 60 * 10;

function isHtmlElement(value: unknown): value is HtmlElement {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "getAttribute" in value &&
    "querySelectorAll" in value &&
    typeof value.getAttribute === "function"
  );
}

function toElementList(value: unknown): HtmlElement[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(isHtmlElement);
  }
  if (!("length" in value) || typeof value.length !== "number") {
    return [];
  }
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    items.push(Reflect.get(value, index));
  }
  return items.filter(isHtmlElement);
}

function wrapDocument(raw: unknown): HtmlDocument {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Failed to parse HTML document");
  }
  if (!("querySelector" in raw) || typeof raw.querySelector !== "function") {
    throw new Error("Failed to parse HTML document");
  }
  if (!("querySelectorAll" in raw) || typeof raw.querySelectorAll !== "function") {
    throw new Error("Failed to parse HTML document");
  }

  const querySelectorFn = raw.querySelector.bind(raw);
  const querySelectorAllFn = raw.querySelectorAll.bind(raw);

  return {
    querySelector: (selector: string): HtmlElement | null => {
      const result: unknown = querySelectorFn(selector);
      return isHtmlElement(result) ? result : null;
    },
    querySelectorAll: (selector: string): HtmlElement[] => {
      return toElementList(querySelectorAllFn(selector));
    },
    body: "body" in raw && isHtmlElement(raw.body) ? raw.body : null,
  };
}

export async function fetchWebsite(url: string): Promise<WebsiteSnapshot> {
  const cached = snapshotCache.get(url);
  if (cached && cached.expires > Date.now()) {
    return cached.snapshot;
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "ListwellSEO/1.0",
    },
  });
  const html = await response.text();
  const documentValue: unknown = new DOMParser().parseFromString(html, "text/html");

  const snapshot: WebsiteSnapshot = {
    url,
    html,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    finalUrl: response.url,
    document: wrapDocument(documentValue),
  };

  snapshotCache.set(url, { snapshot, expires: Date.now() + CACHE_MS });
  return snapshot;
}

export async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "ListwellSEO/1.0",
    },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

export const jsonLdNodeSchema = z.record(z.string(), z.unknown());
export type JsonLdNode = z.infer<typeof jsonLdNodeSchema>;

export function readJsonLd(document: HtmlDocument): JsonLdNode[] {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const nodes: JsonLdNode[] = [];

  for (const script of scripts) {
    if (!script.textContent) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(script.textContent);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const node = jsonLdNodeSchema.safeParse(item);
          if (node.success) {
            nodes.push(node.data);
          }
        }
        continue;
      }
      const node = jsonLdNodeSchema.safeParse(parsed);
      if (node.success) {
        nodes.push(node.data);
        const graph = node.data["@graph"];
        if (Array.isArray(graph)) {
          for (const item of graph) {
            const graphNode = jsonLdNodeSchema.safeParse(item);
            if (graphNode.success) {
              nodes.push(graphNode.data);
            }
          }
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks
    }
  }

  return nodes;
}

export function typeIncludes(node: JsonLdNode, expected: string): boolean {
  const typeValue = node["@type"];
  if (typeof typeValue === "string") {
    return typeValue.includes(expected);
  }
  if (Array.isArray(typeValue)) {
    return typeValue.some((item) => typeof item === "string" && item.includes(expected));
  }
  return false;
}
