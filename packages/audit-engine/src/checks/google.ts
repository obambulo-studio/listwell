import { fetchErrorResult, noListingResult } from "../context";
import type { CheckContext } from "../context";
import { hasAttachedListing, urlsMatch } from "../lookups/listing-evidence";
import type { ListingEvidence } from "../lookups/listing-evidence";
import { checkResult } from "../schemas";
import type { CheckResult } from "../types";

interface ListingFacts {
  mode: "listing" | "website" | "inconclusive" | "missing";
  evidence: ListingEvidence;
  reason?: string;
}

const listingFacts = async (ctx: CheckContext): Promise<ListingFacts> => {
  const listing = await ctx.getListingEvidence();
  if (listing.sourceUrl && !listing.fetched) {
    return {
      evidence: listing,
      mode: "inconclusive",
      reason: `Listing page could not be read: ${listing.fetchReason ?? "unknown error"}`,
    };
  }
  if (listing.fetched) {
    return { evidence: listing, mode: "listing" };
  }

  const website = await ctx.getWebsiteEvidence();
  if (website.fetched) {
    return { evidence: website, mode: "website" };
  }
  return {
    evidence: listing,
    mode: "missing",
    reason:
      listing.fetchReason ?? "No Google listing URL or website facts to check",
  };
};

const sourceLabel = (mode: ListingFacts["mode"]): string => {
  if (mode === "listing") {
    return "pasted listing page";
  }
  if (mode === "website") {
    return "business website";
  }
  return "available sources";
};

export const checkGoogleListing = (ctx: CheckContext): Promise<CheckResult> => {
  const attached = hasAttachedListing(ctx.business.locations);
  if (!attached) {
    return Promise.resolve(
      checkResult(
        null,
        "No Google listing URL or identifier is attached to this audit"
      )
    );
  }
  return Promise.resolve(
    checkResult(
      true,
      "A Google listing URL or identifier is attached to this audit"
    )
  );
};

export const checkGoogleListingPhone = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      return checkResult(Boolean(place.nationalPhoneNumber));
    }

    const facts = await listingFacts(ctx);
    if (facts.mode === "inconclusive") {
      return checkResult(null, facts.reason);
    }
    if (facts.mode === "missing") {
      return noListingResult(facts.reason);
    }
    return checkResult(
      Boolean(facts.evidence.phone),
      facts.evidence.phone
        ? `Phone found on the ${sourceLabel(facts.mode)}: ${facts.evidence.phone}`
        : `No phone number found on the ${sourceLabel(facts.mode)}`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching Google listing");
  }
};

export const checkGoogleListingReviews = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      const count = place.userRatingCount ?? 0;
      const rating = place.rating ?? 0;
      const hasGoodRating = rating >= 4;
      const hasEnoughReviews = count >= 20;
      const passesCheck = hasGoodRating && hasEnoughReviews;

      let label = `${count} reviews with ${rating.toFixed(1)} rating. Good job!`;
      if (!passesCheck) {
        if (!hasGoodRating && !hasEnoughReviews) {
          label = `Only ${count} reviews with ${rating.toFixed(1)} rating. Need ≥ 20 reviews with ≥ 4.0 rating.`;
        } else if (hasGoodRating) {
          label = `Only ${count} reviews. Need at least 20 reviews.`;
        } else {
          label = `Rating is ${rating.toFixed(1)}, which is below 4.0 target.`;
        }
      }

      return checkResult(passesCheck, label);
    }

    const facts = await listingFacts(ctx);
    if (facts.mode === "inconclusive") {
      return checkResult(null, facts.reason);
    }
    if (facts.mode === "missing") {
      return checkResult(
        null,
        "Review counts are not visible without a readable listing page or website schema. We do not invent ratings."
      );
    }

    const count = facts.evidence.reviewCount;
    const { rating } = facts.evidence;
    if (count === undefined && rating === undefined) {
      return checkResult(
        null,
        `No aggregate rating was published on the ${sourceLabel(facts.mode)}. We do not invent review counts.`
      );
    }

    const safeCount = count ?? 0;
    const safeRating = rating ?? 0;
    const passes = safeRating >= 4 && safeCount >= 20;
    return checkResult(
      passes,
      `${safeCount} reviews with ${safeRating.toFixed(1)} rating on the ${sourceLabel(facts.mode)}${passes ? "" : ". Need ≥ 20 reviews with ≥ 4.0 rating."}`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching Google listing");
  }
};

export const checkGoogleListingPhotos = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      const photoCount = place.photos?.length ?? 0;
      const hasPhotos = photoCount > 0;
      return checkResult(
        hasPhotos,
        hasPhotos
          ? `${photoCount} photo${photoCount === 1 ? "" : "s"} found`
          : "No photos found on Google listing"
      );
    }

    const listing = await ctx.getListingEvidence();
    if (listing.sourceUrl && !listing.fetched) {
      return checkResult(
        null,
        `Listing page could not be read: ${listing.fetchReason ?? "unknown error"}`
      );
    }
    if (!listing.fetched) {
      return checkResult(
        null,
        "Photos cannot be counted without a readable listing page. We do not invent photo counts."
      );
    }
    const photoCount = listing.photoCount ?? 0;
    return checkResult(
      photoCount > 0,
      photoCount > 0
        ? `${photoCount} photo${photoCount === 1 ? "" : "s"} found on the pasted listing page`
        : "No photos found on the pasted listing page"
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching Google listing");
  }
};

export const checkGoogleListingOpeningTimes = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      return checkResult(Boolean(place.currentOpeningHours));
    }

    const facts = await listingFacts(ctx);
    if (facts.mode === "inconclusive") {
      return checkResult(null, facts.reason);
    }
    if (facts.mode === "missing") {
      return noListingResult(facts.reason);
    }
    return checkResult(
      Boolean(facts.evidence.hours),
      facts.evidence.hours
        ? `Opening hours found on the ${sourceLabel(facts.mode)}: ${facts.evidence.hours}`
        : `No opening hours found on the ${sourceLabel(facts.mode)}`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching Google listing");
  }
};

export const checkGoogleListingPrimaryCategory = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      const hasTypes = Boolean(place.types && place.types.length > 0);
      const primary = place.types?.[0];
      return checkResult(
        hasTypes,
        primary ? `Primary category: ${primary}` : undefined
      );
    }

    const facts = await listingFacts(ctx);
    if (facts.mode === "inconclusive") {
      return checkResult(null, facts.reason);
    }
    if (facts.mode === "missing") {
      return noListingResult(facts.reason);
    }
    return checkResult(
      Boolean(facts.evidence.category),
      facts.evidence.category
        ? `Category on the ${sourceLabel(facts.mode)}: ${facts.evidence.category}`
        : `No category found on the ${sourceLabel(facts.mode)}`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching Google listing");
  }
};

const websiteMatchLabel = (
  matches: boolean,
  listingWebsite: string | null | undefined,
  businessWebsite: string | null | undefined
): string | undefined => {
  if (matches) {
    return `Listing website matches ${businessWebsite}`;
  }
  if (listingWebsite) {
    return `Listing website ${listingWebsite} does not match ${businessWebsite ?? "the stored website"}`;
  }
  return "No website link found on the pasted listing page";
};

export const checkGoogleListingWebsiteMatches = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      const matches = Boolean(
        place.websiteUri &&
        ctx.business.websiteUrl &&
        place.websiteUri === ctx.business.websiteUrl
      );
      return checkResult(matches);
    }

    const listing = await ctx.getListingEvidence();
    if (listing.sourceUrl && !listing.fetched) {
      return checkResult(
        null,
        `Listing page could not be read: ${listing.fetchReason ?? "unknown error"}`
      );
    }
    if (!listing.fetched) {
      return checkResult(
        null,
        "No website link found on a listing page to compare."
      );
    }
    const matches = urlsMatch(listing.website, ctx.business.websiteUrl);
    return checkResult(
      matches,
      websiteMatchLabel(matches, listing.website, ctx.business.websiteUrl)
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching Google listing");
  }
};
