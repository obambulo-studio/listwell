import { z } from "zod";

import { runBusinessCheckBatch } from "@/lib/audit-jobs";
import { persistedCategoryLabel } from "@/lib/category";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "@/lib/chat-onboarding";
import { checksForCategory } from "@/lib/checks/registry";
import { createBusiness } from "@/lib/data";
import {
  discoverBusiness,
  discoverResponseSchema,
  filterProfilesForCandidate,
} from "@/lib/discover";
import type { PlaceCandidate } from "@/lib/discover";
import { withDiscoveryPin } from "@/lib/place-pin";
import { mapProfilesToBusinessData } from "@/lib/profiles";
import { checkResultSchema } from "@/lib/schema";
import { listwellSiteUrl } from "@/lib/site-metadata";

export const placeCandidateKey = (candidate: PlaceCandidate): string =>
  `${candidate.source}:${candidate.id}`;

export const parsePlaceCandidateKey = (
  value: string
): { id: string; source: PlaceCandidate["source"] } | null => {
  const match = /^(?<source>google|apple|osm):(?<id>.+)$/u.exec(value.trim());
  const source = match?.groups?.source;
  const id = match?.groups?.id;
  if (!source || !id) {
    return null;
  }
  if (source !== "google" && source !== "apple" && source !== "osm") {
    return null;
  }
  return { id, source };
};

export const runListingAuditInputSchema = z.object({
  businessName: z.string().trim().min(1),
  candidateId: z.string().trim().min(1).optional(),
  near: z.string().trim().min(1).optional(),
  websiteUrl: z.string().trim().min(1).optional(),
});

export type RunListingAuditInput = z.infer<typeof runListingAuditInputSchema>;

export type RunListingAuditOutcome =
  | {
      body: {
        candidates: {
          address?: string;
          candidateId: string;
          name: string;
          source: string;
        }[];
        message: string;
        needsConfirmation: true;
      };
      ok: true;
    }
  | {
      body: {
        businessId: string;
        markdown: string;
        reportUrl: string;
        score: number;
      };
      ok: true;
    }
  | { error: string; ok: false; status: number };

const resolveCandidate = (
  candidates: PlaceCandidate[],
  input: RunListingAuditInput,
  strongMatchId?: string
): PlaceCandidate | null => {
  if (input.candidateId) {
    const parsed = parsePlaceCandidateKey(input.candidateId);
    if (!parsed) {
      return null;
    }
    return (
      candidates.find(
        (item) => item.source === parsed.source && item.id === parsed.id
      ) ?? null
    );
  }
  if (strongMatchId) {
    return candidates.find((item) => item.id === strongMatchId) ?? null;
  }
  return null;
};

const buildBasicAuditMarkdown = (input: {
  businessName: string;
  checks: { status: string; title: string }[];
  score: number;
}): string => {
  const lines = [
    `# ${input.businessName} — basic Listwell audit`,
    "",
    `Visibility score: **${input.score}%** (pass/fail checks only; fix steps require a paid report or an API key with entitlement).`,
    "",
    "## Check outcomes",
    "",
  ];
  for (const check of input.checks) {
    let icon = "Error";
    if (check.status === "pass") {
      icon = "Pass";
    } else if (check.status === "fail") {
      icon = "Fail";
    }
    lines.push(`- **${icon}** — ${check.title}`);
  }
  lines.push("");
  return lines.join("\n");
};

const discoverySupportsWebsiteOnlyAudit = (
  discovery: z.infer<typeof discoverResponseSchema>,
  websiteUrl?: string
): boolean => {
  if (websiteUrl?.trim()) {
    return true;
  }
  return discovery.profiles.some((profile) => profile.type === "website");
};

const finishListingAuditForCandidate = async (
  parsed: RunListingAuditInput,
  discovery: z.infer<typeof discoverResponseSchema>,
  candidate?: PlaceCandidate
): Promise<RunListingAuditOutcome> => {
  const profiles = candidate
    ? filterProfilesForCandidate(discovery.profiles, candidate)
    : discovery.profiles;
  const payload = mapProfilesToBusinessData(
    parsed.businessName,
    discovery.categoryId,
    profiles
  );
  payload.categoryLabel = persistedCategoryLabel({
    categoryId: discovery.categoryId,
    label: discovery.categoryDisplayLabel,
  });
  if (parsed.websiteUrl?.trim()) {
    payload.websiteUrl = parsed.websiteUrl.trim();
  }
  const googlePin = candidate?.source === "google" ? candidate : undefined;
  payload.locations = withDiscoveryPin(payload.locations, googlePin);
  const address = discovery.address ?? candidate?.address;
  if (address?.trim()) {
    if (payload.locations.length === 0) {
      payload.locations.push({
        address: address.trim(),
        name: parsed.businessName,
      });
    } else if (!payload.locations[0]?.address) {
      payload.locations[0] = {
        ...payload.locations[0],
        address: address.trim(),
      };
    }
  }

  const business = await createBusiness({
    ...payload,
    id: crypto.randomUUID(),
  });

  const definitions = checksForCategory(business.category);
  const batch = await runBusinessCheckBatch(business);
  const checks = definitions.map((definition) => {
    const raw = batch.results[definition.id];
    const result = checkResultSchema.safeParse(raw);
    const parsedResult = result.success
      ? result.data
      : checkResultSchema.parse({
          label: "This check could not run",
          type: "check",
          value: null,
        });
    return {
      status: statusFromResult(parsedResult),
      title: definition.title,
    };
  });

  const counts = visibilityCounts(checks);
  const score = scorePercent(counts);
  const origin = listwellSiteUrl();
  const reportUrl = `${origin}/${encodeURIComponent(business.id)}`;

  return {
    body: {
      businessId: business.id,
      markdown: buildBasicAuditMarkdown({
        businessName: business.name,
        checks,
        score,
      }),
      reportUrl,
      score,
    },
    ok: true,
  };
};

export const runListingAudit = async (
  input: RunListingAuditInput,
  env: Parameters<typeof discoverBusiness>[1],
  fetchOptions: Parameters<typeof discoverBusiness>[2]
): Promise<RunListingAuditOutcome> => {
  const parsed = runListingAuditInputSchema.parse(input);
  const discovery = discoverResponseSchema.parse(
    await discoverBusiness(
      {
        businessName: parsed.businessName,
        near: parsed.near,
        websiteUrl: parsed.websiteUrl,
      },
      env,
      fetchOptions
    )
  );

  if (parsed.candidateId) {
    const candidate = resolveCandidate(discovery.candidates, parsed);
    if (!candidate) {
      return {
        error: "candidateId does not match the latest discover results.",
        ok: false,
        status: 400,
      };
    }
    return await finishListingAuditForCandidate(parsed, discovery, candidate);
  }

  const autoCandidate = resolveCandidate(
    discovery.candidates,
    parsed,
    discovery.strongMatchId
  );

  if (!autoCandidate) {
    if (discovery.candidates.length === 0) {
      if (discoverySupportsWebsiteOnlyAudit(discovery, parsed.websiteUrl)) {
        return finishListingAuditForCandidate(parsed, discovery);
      }
      return {
        error: "No map listings found. Try a location hint or website URL.",
        ok: false,
        status: 404,
      };
    }
    return {
      body: {
        candidates: discovery.candidates.map((item) => ({
          address: item.address,
          candidateId: placeCandidateKey(item),
          name: item.name,
          source: item.source,
        })),
        message:
          "Multiple listings match. Call run_listing_audit again with candidateId set to one of the candidateId values.",
        needsConfirmation: true,
      },
      ok: true,
    };
  }

  return finishListingAuditForCandidate(parsed, discovery, autoCandidate);
};
