import { describe, expect, it } from "vitest";

import {
  hashAgentApiKey,
  parseAgentKeyListItems,
  parseBearerAgentKey,
  prepareNewAgentApiKey,
} from "./agent-api-keys";

describe(parseBearerAgentKey, () => {
  it("reads a bearer lw_ token", () => {
    expect(parseBearerAgentKey("Bearer lw_abc123")).toBe("lw_abc123");
  });

  it("rejects non-lw tokens", () => {
    expect(parseBearerAgentKey("Bearer sk_test")).toBeNull();
  });
});

describe(parseAgentKeyListItems, () => {
  it("returns an empty list when there are no keys", () => {
    expect(parseAgentKeyListItems([])).toStrictEqual([]);
  });

  it("accepts Convex rows with omitted optional timestamps", () => {
    const keys = parseAgentKeyListItems([
      {
        createdAt: "2026-10-08T03:19:00.000Z",
        id: "j57abc123",
        label: "Grok",
        prefix: "lw_testprefix",
      },
    ]);
    expect(keys).toStrictEqual([
      {
        createdAt: "2026-10-08T03:19:00.000Z",
        id: "j57abc123",
        label: "Grok",
        lastUsedAt: null,
        prefix: "lw_testprefix",
        revokedAt: null,
      },
    ]);
  });

  it("maps _id when id is missing", () => {
    const keys = parseAgentKeyListItems([
      {
        _id: "j57fromUnderscore",
        createdAt: "2026-10-08T03:19:00.000Z",
        label: "CLI",
        lastUsedAt: "2026-10-08T04:00:00.000Z",
        prefix: "lw_cli123456",
        revokedAt: null,
      },
    ]);
    expect(keys[0]?.id).toBe("j57fromUnderscore");
    expect(keys[0]?.lastUsedAt).toBe("2026-10-08T04:00:00.000Z");
  });
});

describe(prepareNewAgentApiKey, () => {
  it("hashes keys consistently", async () => {
    const first = await prepareNewAgentApiKey();
    const hash = await hashAgentApiKey(first.key);
    expect(hash).toHaveLength(64);
    expect(first.key.startsWith("lw_")).toBeTruthy();
    expect(first.prefix).toBe(first.key.slice(0, 12));
  });
});
