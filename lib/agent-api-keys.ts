import { z } from "zod";

import { sha256Hex } from "@/lib/agent-discovery";
import { api, convexMutation, convexQuery } from "@/lib/convex/server";
import { zNullableString } from "@/lib/zod-coerce";

import type { Id } from "../convex/_generated/dataModel";

const AGENT_KEY_PREFIX = "lw_";
const KEY_RANDOM_BYTES = 24;

export const agentKeyLabelSchema = z.string().trim().min(1).max(80);

export const agentKeyListItemSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  label: z.string(),
  lastUsedAt: zNullableString,
  prefix: z.string(),
  revokedAt: zNullableString,
});

const agentKeyListRowInputSchema = z
  .object({
    _id: z.unknown().optional(),
    createdAt: z.unknown(),
    id: z.unknown().optional(),
    label: z.unknown(),
    lastUsedAt: z.unknown().optional(),
    prefix: z.unknown(),
    revokedAt: z.unknown().optional(),
  })
  .transform((row) => ({
    createdAt: z.string().parse(row.createdAt),
    id: z.string().parse(row.id ?? row._id),
    label: z.string().parse(row.label),
    lastUsedAt: row.lastUsedAt,
    prefix: z.string().parse(row.prefix),
    revokedAt: row.revokedAt,
  }));

export const parseAgentKeyListItems = (rows: unknown[]): AgentKeyListItem[] =>
  z
    .array(agentKeyListItemSchema)
    .parse(rows.map((row) => agentKeyListRowInputSchema.parse(row)));

export type AgentKeyListItem = z.infer<typeof agentKeyListItemSchema>;

const agentKeyIdSchema = z.string().min(1);

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  const base64 = btoa(binary);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const generateAgentApiKey = (): {
  key: string;
  keyHash: string;
  prefix: string;
} => {
  const random = crypto.getRandomValues(new Uint8Array(KEY_RANDOM_BYTES));
  const secret = `${AGENT_KEY_PREFIX}${bytesToBase64Url(random)}`;
  const prefix = secret.slice(0, 12);
  return { key: secret, keyHash: "", prefix };
};

export const hashAgentApiKey = (key: string): Promise<string> => sha256Hex(key);

export const prepareNewAgentApiKey = (): Promise<{
  key: string;
  keyHash: string;
  prefix: string;
}> => {
  const material = generateAgentApiKey();
  return hashAgentApiKey(material.key).then((keyHash) => ({
    ...material,
    keyHash,
  }));
};

export const parseBearerAgentKey = (
  authorizationHeader: string | null
): string | null => {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer\s+(?<token>\S+)\s*$/iu.exec(authorizationHeader);
  const token = match?.groups?.token;
  if (!token) {
    return null;
  }
  if (!token.startsWith(AGENT_KEY_PREFIX)) {
    return null;
  }
  return token;
};

export const resolveAgentKeyUserId = async (
  key: string
): Promise<string | null> => {
  const keyHash = await hashAgentApiKey(key);
  const resolved = await convexMutation(api.agentApiKeys.resolveUserInternal, {
    keyHash,
    touchAt: new Date().toISOString(),
  });
  return resolved?.userId ?? null;
};

export const createAgentApiKeyForUser = async (input: {
  label: string;
  userId: string;
}): Promise<{ id: string; key: string; prefix: string }> => {
  const label = agentKeyLabelSchema.parse(input.label);
  const { key, keyHash, prefix } = await prepareNewAgentApiKey();
  const created = await convexMutation(api.agentApiKeys.createInternal, {
    createdAt: new Date().toISOString(),
    keyHash,
    label,
    prefix,
    userId: input.userId,
  });
  return { id: created.id, key, prefix };
};

export const listAgentApiKeysForUser = async (
  userId: string
): Promise<AgentKeyListItem[]> => {
  const rows = await convexQuery(api.agentApiKeys.listForUserInternal, {
    userId,
  });
  return parseAgentKeyListItems(rows);
};

export const revokeAgentApiKeyForUser = async (input: {
  keyId: string;
  userId: string;
}): Promise<void> => {
  const keyId = agentKeyIdSchema.parse(input.keyId);
  await convexMutation(api.agentApiKeys.revokeInternal, {
    keyId: keyId as Id<"agentApiKeys">,
    revokedAt: new Date().toISOString(),
    userId: input.userId,
  });
};

export const listAgentBusinessesForUser = async (userId: string) => {
  const rows = await convexQuery(
    api.agentApiKeys.listBusinessesForUserInternal,
    { userId }
  );
  return z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        plan: z.enum(["preview", "once", "monthly"]),
        unlocked: z.boolean(),
      })
    )
    .parse(rows);
};

export const assertAgentBusinessOwned = async (
  userId: string,
  businessExternalId: string
): Promise<{ name: string } | null> => {
  const result = await convexQuery(
    api.agentApiKeys.assertBusinessOwnedInternal,
    { businessExternalId, userId }
  );
  if (!result.ok) {
    return null;
  }
  return { name: result.name };
};
