import { describe, expect, it } from "vitest";

import {
  hashAgentApiKey,
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

describe(prepareNewAgentApiKey, () => {
  it("hashes keys consistently", async () => {
    const first = await prepareNewAgentApiKey();
    const hash = await hashAgentApiKey(first.key);
    expect(hash).toHaveLength(64);
    expect(first.key.startsWith("lw_")).toBeTruthy();
    expect(first.prefix).toBe(first.key.slice(0, 12));
  });
});
