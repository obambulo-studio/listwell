"use client";

import useSWR from "swr";

import { listingReviewResultSchema } from "@/lib/listing-review";
import type { ListingReviewResult } from "@/lib/listing-review";

const fetchListingReview = async (
  businessId: string
): Promise<ListingReviewResult> => {
  const response = await fetch(`/api/businesses/${businessId}/listing-review`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Listing review failed");
  }
  return listingReviewResultSchema.parse(await response.json());
};

const degradedCaption = (result: ListingReviewResult): string | null => {
  if (result.available) {
    return null;
  }
  switch (result.degradedReason) {
    case "ai_binding_missing": {
      return "AI suggestions are unavailable in this environment. NAP and photo checklist still reflect fetched data.";
    }
    case "model_request_failed": {
      return "AI suggestions could not be generated right now. Showing data-backed checklist items only.";
    }
    case "model_output_invalid": {
      return "AI output did not pass validation. Showing data-backed checklist items only.";
    }
    case "insufficient_sources": {
      return "Not enough listing data to generate suggestions.";
    }
    default: {
      return null;
    }
  }
};

const SourceBadge = () => (
  <span className="listwell-report__ai-badge">AI suggestion</span>
);

const ListingReviewBody = ({ result }: { result: ListingReviewResult }) => {
  const caption = degradedCaption(result);
  const { content } = result;

  return (
    <div className="listwell-report__listing-review">
      <p className="vbg-caption">{result.disclaimer}</p>
      {caption ? <p className="vbg-caption">{caption}</p> : null}
      {result.cached ? (
        <p className="vbg-caption">Cached for this report snapshot.</p>
      ) : null}

      {content.businessDescription ? (
        <div className="listwell-report__listing-block">
          <h3 className="vbg-heading-20">
            Suggested business description <SourceBadge />
          </h3>
          <pre className="listwell-report__copy-block">
            {content.businessDescription.suggestedText}
          </pre>
        </div>
      ) : null}

      {content.categories ? (
        <div className="listwell-report__listing-block">
          <h3 className="vbg-heading-20">
            Suggested categories <SourceBadge />
          </h3>
          <p className="vbg-lede">
            Primary: <strong>{content.categories.primary}</strong>
          </p>
          {content.categories.secondary.length > 0 ? (
            <ul className="listwell-report__actions">
              {content.categories.secondary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {content.photoChecklistGaps.length > 0 ? (
        <div className="listwell-report__listing-block">
          <h3 className="vbg-heading-20">Photo checklist</h3>
          <ul className="listwell-report__actions">
            {content.photoChecklistGaps.map((gap) => (
              <li key={gap.item}>
                <strong>{gap.item}</strong>
                <span className="vbg-meta"> — {gap.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {content.napMismatches.length > 0 ? (
        <div className="listwell-report__listing-block">
          <h3 className="vbg-heading-20">NAP mismatches</h3>
          <ul className="listwell-report__actions">
            {content.napMismatches.map((row) => (
              <li key={row.field}>
                <strong>{row.field}</strong>
                <ul>
                  {row.values.map((entry) => (
                    <li key={`${entry.sourceId}-${entry.value}`}>
                      {entry.sourceId}: {entry.value}
                    </li>
                  ))}
                </ul>
                <p className="vbg-meta">{row.suggestedFix}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {content.reviewReplyTemplates.length > 0 ? (
        <div className="listwell-report__listing-block">
          <h3 className="vbg-heading-20">
            Suggested review replies <SourceBadge />
          </h3>
          {content.reviewReplyTemplates.map((template) => (
            <div
              key={template.reviewSnippet}
              className="listwell-report__reply-template"
            >
              <p className="vbg-meta">Review excerpt</p>
              <blockquote className="listwell-report__copy-block">
                {template.reviewSnippet}
              </blockquote>
              <p className="vbg-meta">Suggested reply</p>
              <pre className="listwell-report__copy-block">
                {template.suggestedReply}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const ListingReviewSection = ({
  businessId,
  showContent,
}: {
  businessId: string;
  showContent: boolean;
}) => {
  const { data, error, isLoading } = useSWR(
    showContent ? (["listing-review", businessId] as const) : null,
    ([, id]) => fetchListingReview(id),
    { revalidateOnFocus: false }
  );

  return (
    <section
      className="listwell-report__chapter"
      aria-labelledby="listing-review-heading"
    >
      <h2 className="vbg-heading-24" id="listing-review-heading">
        AI listing review
      </h2>
      <p className="vbg-meta listwell-report__detail-meta">
        Copy-paste improvements from your website and map listings.
      </p>

      {showContent ? (
        <>
          {isLoading ? (
            <p className="vbg-caption">Generating listing suggestions…</p>
          ) : null}
          {error ? (
            <p className="vbg-caption">
              Listing suggestions could not be loaded. Try refreshing the page.
            </p>
          ) : null}
          {data ? <ListingReviewBody result={data} /> : null}
        </>
      ) : (
        <p className="vbg-caption">
          Unlock the full report to see AI listing suggestions.
        </p>
      )}
    </section>
  );
};
