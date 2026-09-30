import { z } from "zod";

import type { CheckContext } from "../context";
import { pngLikeness } from "./png-hash";
import type { ImageLikeness } from "./png-hash";
import type { SocialProfileEvidence } from "./social-profiles";

const SAME_MARK_CONFIDENCE = 0.6;

const choiceSchema = z.object({
  choice: z.string(),
  confidence: z.number(),
  type: z.literal("choice"),
});

const systemOneSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

const loadImage = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<Uint8Array | null> => {
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "ListwellAuditBot/1.0 (+https://listwell.dev)" },
    });
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
};

const sameMarkWithJev = async (
  ctx: CheckContext,
  leftUrl: string,
  rightUrl: string
): Promise<ImageLikeness> => {
  const apiKey = ctx.env.typesafeApiKey;
  if (!apiKey) {
    return "unsure";
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await ctx.fetchImpl(
      "https://api.typesafe.ai/v1/systemone",
      {
        body: JSON.stringify({
          model: ctx.env.typesafeModel ?? "jev-latest",
          questions: {
            same_mark: {
              criteria: {
                different: "The profile photos show different marks",
                same: "The profile photos are the same logo or avatar",
              },
              instructions:
                "Do the two image URLs in `images` show the same logo or avatar?",
              type: "choice",
            },
          },
          state: { images: [leftUrl, rightUrl] },
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      return "unsure";
    }
    const parsed = systemOneSchema.safeParse(await response.json());
    if (!parsed.success) {
      return "unsure";
    }
    const answer = choiceSchema.safeParse(parsed.data.answers.same_mark);
    if (!answer.success || answer.data.confidence < SAME_MARK_CONFIDENCE) {
      return "unsure";
    }
    if (answer.data.choice === "same") {
      return "match";
    }
    if (answer.data.choice === "different") {
      return "different";
    }
    return "unsure";
  } catch {
    return "unsure";
  } finally {
    clearTimeout(timeoutId);
  }
};

const likenessForBytes = async (
  ctx: CheckContext,
  leftUrl: string,
  rightUrl: string,
  left: Uint8Array,
  right: Uint8Array
): Promise<ImageLikeness> => {
  if (bytesEqual(left, right)) {
    return "match";
  }
  const hashed = await pngLikeness(left, right);
  if (hashed !== "unsure") {
    return hashed;
  }
  return await sameMarkWithJev(ctx, leftUrl, rightUrl);
};

export const compareProfileAvatars = async (
  ctx: CheckContext,
  profiles: SocialProfileEvidence[]
): Promise<"match" | "different" | "unknown" | "too-few"> => {
  const candidates = profiles.filter(
    (profile) => profile.readable && profile.avatarUrl
  );
  if (candidates.length < 2) {
    return "too-few";
  }

  const avatarUrls = [
    ...new Set(
      candidates.flatMap((profile) =>
        profile.avatarUrl ? [profile.avatarUrl] : []
      )
    ),
  ];
  const loadedBytes = await Promise.all(
    avatarUrls.map(async (avatarUrl) => ({
      avatarUrl,
      bytes: await loadImage(avatarUrl, ctx.fetchImpl),
    }))
  );
  const bytesByUrl = new Map(
    loadedBytes.map((item) => [item.avatarUrl, item.bytes])
  );
  const loaded: (SocialProfileEvidence & { avatarUrl: string })[] = [];
  for (const profile of candidates) {
    const { avatarUrl } = profile;
    if (!avatarUrl || !bytesByUrl.get(avatarUrl)) {
      continue;
    }
    loaded.push({ ...profile, avatarUrl });
  }
  if (loaded.length < 2) {
    return "too-few";
  }

  const pairs = loaded.slice(1).map((right, index) => {
    const left = loaded[index];
    return left ? { left, right } : null;
  });
  const likenesses = await Promise.all(
    pairs.map(async (pair) => {
      if (!pair || pair.left.avatarUrl === pair.right.avatarUrl) {
        return "match";
      }
      const leftBytes = bytesByUrl.get(pair.left.avatarUrl);
      const rightBytes = bytesByUrl.get(pair.right.avatarUrl);
      if (!leftBytes || !rightBytes) {
        return "unsure";
      }
      return await likenessForBytes(
        ctx,
        pair.left.avatarUrl,
        pair.right.avatarUrl,
        leftBytes,
        rightBytes
      );
    })
  );
  if (likenesses.includes("different")) {
    return "different";
  }
  if (likenesses.includes("unsure")) {
    return "unknown";
  }
  return "match";
};
