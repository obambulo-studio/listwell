"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { listwellChatHref } from "@/lib/listwell-routes";
import { clearChatSession, LISTWELL_PENDING_BUSINESS_KEY } from "@/lib/storage";

type JsonSchema = Record<string, unknown>;

interface ModelContextTool {
  description: string;
  execute: (
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ) => Promise<unknown>;
  inputSchema: JsonSchema;
  name: string;
}

interface ModelContextHost {
  registerTool: (
    tool: ModelContextTool,
    options?: { signal?: AbortSignal }
  ) => Promise<void>;
}

const readModelContext = (): ModelContextHost | undefined => {
  if (typeof document === "undefined") {
    return undefined;
  }
  const documentHost = (
    document as Document & { modelContext?: ModelContextHost }
  ).modelContext;
  if (documentHost) {
    return documentHost;
  }
  return (navigator as Navigator & { modelContext?: ModelContextHost })
    .modelContext;
};

const stringField = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const createListwellWebMcpTools = (runtime: {
  origin: string;
  push: (href: string) => void;
}): ModelContextTool[] => {
  const { origin, push } = runtime;
  return [
    {
      description:
        "Start a free Listwell local and website SEO audit by navigating to chat with a business name.",
      execute: (input) => {
        const businessName = stringField(input.businessName);
        if (!businessName) {
          throw new Error("businessName is required");
        }
        clearChatSession();
        window.sessionStorage.setItem(
          LISTWELL_PENDING_BUSINESS_KEY,
          businessName
        );
        const href = listwellChatHref();
        push(href);
        return Promise.resolve({ href, ok: true });
      },
      inputSchema: {
        additionalProperties: false,
        properties: {
          businessName: {
            description: "Business name to look up on maps and the web",
            minLength: 1,
            type: "string",
          },
        },
        required: ["businessName"],
        type: "object",
      },
      name: "start_listing_audit",
    },
    {
      description:
        "Search Google, Apple, and OpenStreetMap listings for a business name (rate limited).",
      execute: async (input, options) => {
        const businessName = stringField(input.businessName);
        if (!businessName) {
          throw new Error("businessName is required");
        }
        const near = stringField(input.near);
        const response = await fetch(`${origin}/api/discover`, {
          body: JSON.stringify({
            businessName,
            ...(near ? { near } : {}),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: options?.signal,
        });
        const payload: unknown = await response.json();
        return { body: payload, ok: response.ok, status: response.status };
      },
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
    },
    {
      description:
        "Read Listwell audit engine health and lookup provider status.",
      execute: async (_input, options) => {
        const response = await fetch(`${origin}/api/health`, {
          method: "GET",
          signal: options?.signal,
        });
        const payload: unknown = await response.json();
        return { body: payload, ok: response.ok, status: response.status };
      },
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      name: "listwell_health",
    },
  ];
};

export const ListwellWebMcp = () => {
  const { push } = useRouter();

  useEffect(() => {
    const host = readModelContext();
    if (!host) {
      return;
    }

    const controller = new AbortController();
    const tools = createListwellWebMcpTools({
      origin: window.location.origin,
      push,
    });

    const registerAll = async () => {
      try {
        await Promise.all(
          tools.map((tool) =>
            host.registerTool(tool, { signal: controller.signal })
          )
        );
      } catch {
        // WebMCP may reject duplicate registrations during fast refresh.
      }
    };

    void registerAll();

    return () => {
      controller.abort();
    };
  }, [push]);

  return null;
};
