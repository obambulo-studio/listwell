"use client";

import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listingReviewResultSchema } from "@/lib/listing-review";
import type { ListingReviewResult } from "@/lib/listing-review";
import { cn } from "@/lib/utils";

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
  <Badge variant="secondary" className="ml-2 align-middle font-normal">
    AI suggestion
  </Badge>
);

const CopyBlock = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}) => (
  <pre
    className={cn(
      "bg-muted/50 rounded-lg border px-3 py-2 font-mono text-sm leading-relaxed whitespace-pre-wrap",
      className
    )}
  >
    {children}
  </pre>
);

const ListingReviewBody = ({ result }: { result: ListingReviewResult }) => {
  const caption = degradedCaption(result);
  const { content } = result;

  return (
    <div className="flex flex-col gap-4">
      <p className="vbg-caption">{result.disclaimer}</p>
      {caption ? <p className="vbg-caption">{caption}</p> : null}
      {result.cached ? (
        <p className="vbg-caption">Cached for this report snapshot.</p>
      ) : null}

      {content.businessDescription ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">
              Suggested business description
              <SourceBadge />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CopyBlock>{content.businessDescription.suggestedText}</CopyBlock>
          </CardContent>
        </Card>
      ) : null}

      {content.categories ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">
              Suggested categories
              <SourceBadge />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
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
          </CardContent>
        </Card>
      ) : null}

      {content.photoChecklistGaps.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">Photo checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="listwell-report__actions">
              {content.photoChecklistGaps.map((gap) => (
                <li key={gap.item}>
                  <strong>{gap.item}</strong>
                  <span className="text-muted-foreground text-sm">
                    {" "}
                    — {gap.reason}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {content.napMismatches.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">NAP mismatches</CardTitle>
            <CardDescription>
              Name, address and phone should match across listings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="listwell-report__actions">
              {content.napMismatches.map((row) => (
                <li key={row.field}>
                  <strong>{row.field}</strong>
                  <ul className="mt-1 font-mono text-sm">
                    {row.values.map((entry) => (
                      <li key={`${entry.sourceId}-${entry.value}`}>
                        {entry.sourceId}: {entry.value}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {row.suggestedFix}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {content.reviewReplyTemplates.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">
              Suggested review replies
              <SourceBadge />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {content.reviewReplyTemplates.map((template) => (
              <div key={template.reviewSnippet}>
                <p className="text-muted-foreground text-sm">Review excerpt</p>
                <CopyBlock className="mt-1 italic">
                  {template.reviewSnippet}
                </CopyBlock>
                <p className="text-muted-foreground mt-3 text-sm">
                  Suggested reply
                </p>
                <CopyBlock className="mt-1">
                  {template.suggestedReply}
                </CopyBlock>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export const ListingReviewSection = ({
  businessId,
  showContent,
  listingReviewOverride,
}: {
  businessId: string;
  showContent: boolean;
  listingReviewOverride?: ListingReviewResult;
}) => {
  const { data, error, isLoading } = useSWR(
    showContent && listingReviewOverride === undefined
      ? (["listing-review", businessId] as const)
      : null,
    ([, id]) => fetchListingReview(id),
    { revalidateOnFocus: false }
  );
  const resolved = listingReviewOverride ?? data;

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
          {isLoading && listingReviewOverride === undefined ? (
            <p className="vbg-caption">Generating listing suggestions…</p>
          ) : null}
          {error && listingReviewOverride === undefined ? (
            <p className="vbg-caption">
              Listing suggestions could not be loaded. Try refreshing the page.
            </p>
          ) : null}
          {resolved ? <ListingReviewBody result={resolved} /> : null}
        </>
      ) : (
        <p className="vbg-caption">
          Unlock the full report to see AI listing suggestions.
        </p>
      )}
    </section>
  );
};
