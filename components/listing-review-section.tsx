"use client";

import { Copy01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import useSWR from "swr";

import { Icon } from "@/components/icon";
import { PrimaryButton } from "@/components/listwell/actions";
import {
  buildListingReviewFixPrompt,
  listingReviewFieldLabel,
  listingReviewHasFixPrompt,
  listingReviewResultSchema,
  listingReviewSourceLabel,
} from "@/lib/listing-review";
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

const SourceBadge = () => <span className="listwell-pill">AI suggestion</span>;

const ReviewBlock = ({
  title,
  aiSuggestion = false,
  note,
  children,
}: {
  title: string;
  aiSuggestion?: boolean;
  note?: string;
  children: ReactNode;
}) => (
  <div className="listwell-panel__body">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-ink m-0 text-[13px] font-semibold">{title}</h3>
      {aiSuggestion ? <SourceBadge /> : null}
    </div>
    {note ? <p className="listwell-panel__note">{note}</p> : null}
    {children}
  </div>
);

const ListingReviewBody = ({ result }: { result: ListingReviewResult }) => {
  const { content } = result;

  return (
    <>
      {content.businessDescription ? (
        <ReviewBlock title="Suggested business description" aiSuggestion>
          <p className="listwell-copy">
            {content.businessDescription.suggestedText}
          </p>
        </ReviewBlock>
      ) : null}

      {content.categories ? (
        <ReviewBlock title="Suggested categories" aiSuggestion>
          <p className="listwell-panel__text">
            Primary: <strong>{content.categories.primary}</strong>
          </p>
          {content.categories.secondary.length > 0 ? (
            <ul className="listwell-chips m-0 list-none p-0">
              {content.categories.secondary.map((item) => (
                <li key={item} className="listwell-pill">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </ReviewBlock>
      ) : null}

      {content.photoChecklistGaps.length > 0 ? (
        <ReviewBlock title="Photo checklist">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {content.photoChecklistGaps.map((gap) => (
              <li key={gap.item} className="text-[13px] leading-normal">
                <span className="text-ink font-medium">{gap.item}</span>
                <span className="text-ink-2"> · {gap.reason}</span>
              </li>
            ))}
          </ul>
        </ReviewBlock>
      ) : null}

      {content.napMismatches.length > 0 ? (
        <ReviewBlock
          title="Name, address and phone mismatches"
          note="Name, address and phone should match across listings."
        >
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {content.napMismatches.map((row) => (
              <li key={row.field} className="flex flex-col gap-1.5">
                <span className="text-ink text-[13px] font-medium">
                  {listingReviewFieldLabel(row.field)}
                </span>
                <ul className="listwell-copy m-0 list-none">
                  {row.values.map((entry) => (
                    <li key={`${entry.sourceId}-${entry.value}`}>
                      {listingReviewSourceLabel(entry.sourceId)}: {entry.value}
                    </li>
                  ))}
                </ul>
                <p className="listwell-panel__note">{row.suggestedFix}</p>
              </li>
            ))}
          </ul>
        </ReviewBlock>
      ) : null}

      {content.reviewReplyTemplates.length > 0 ? (
        <ReviewBlock title="Suggested review replies" aiSuggestion>
          {content.reviewReplyTemplates.map((template) => (
            <div key={template.reviewSnippet} className="flex flex-col gap-1.5">
              <p className="listwell-panel__fine">Review excerpt</p>
              <p className="listwell-copy listwell-copy--quote">
                {template.reviewSnippet}
              </p>
              <p className="listwell-panel__fine mt-1.5">Suggested reply</p>
              <p className="listwell-copy">{template.suggestedReply}</p>
            </div>
          ))}
        </ReviewBlock>
      ) : null}
    </>
  );
};

const ListingReviewFixPrompt = ({
  businessName,
  result,
}: {
  businessName: string;
  result: ListingReviewResult;
}) => {
  const [copied, setCopied] = useState(false);
  if (!listingReviewHasFixPrompt(result.content)) {
    return null;
  }
  const prompt = buildListingReviewFixPrompt({
    businessName,
    content: result.content,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="listwell-panel__body">
      <h3 className="text-ink m-0 text-[13px] font-semibold">
        How to improve your listings
      </h3>
      <p className="listwell-panel__note mt-2">
        Apply these steps on Google Business Profile and your website.
      </p>
      <ol className="listwell-copy m-0 mt-2 list-decimal pl-5">
        <li>
          Update the description, categories, photos, and review replies on
          Google Business Profile.
        </li>
        <li>
          Use the same business name, address, phone number, and website on your
          site.
        </li>
      </ol>
      <pre className="text-ink-2 border-border bg-muted/40 mt-3 max-h-64 overflow-auto rounded-md border p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
        {prompt}
      </pre>
      <div className="mt-3">
        <PrimaryButton
          className="gap-2"
          size="sm"
          type="button"
          onClick={() => {
            void handleCopy();
          }}
        >
          <Icon icon={Copy01Icon} size={14} />
          {copied ? "Copied" : "Copy listing instructions"}
        </PrimaryButton>
      </div>
      <p className="listwell-panel__fine mt-3">
        These are AI-generated recommendations. Verify every change before
        publishing on Google or your website.
      </p>
    </div>
  );
};

const ListingReviewFoot = ({ result }: { result: ListingReviewResult }) => {
  const caption = degradedCaption(result);
  return (
    <div className="listwell-panel__foot">
      <div className="flex flex-col gap-1">
        <p className="listwell-panel__fine">{result.disclaimer}</p>
        {caption ? <p className="listwell-panel__fine">{caption}</p> : null}
        {result.cached ? (
          <p className="listwell-panel__fine">
            Cached for this report snapshot.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export const ListingReviewSection = ({
  businessId,
  businessName,
  showContent,
  listingReviewOverride,
}: {
  businessId: string;
  businessName: string;
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
      className="listwell-panel"
      aria-labelledby="listing-review-heading"
    >
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="listing-review-heading">
          AI listing review
        </h2>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">
          Suggestions from your website and map listings. Apply them on Google
          Business Profile and your website.
        </p>
        {showContent && isLoading && listingReviewOverride === undefined ? (
          <p className="listwell-panel__fine" aria-live="polite">
            Generating listing suggestions…
          </p>
        ) : null}
        {showContent && error && listingReviewOverride === undefined ? (
          <p className="listwell-panel__error" role="alert">
            Listing suggestions could not be loaded. Try refreshing the page.
          </p>
        ) : null}
        {showContent ? null : (
          <p className="listwell-panel__fine">
            Unlock the full report to see AI listing suggestions.
          </p>
        )}
      </div>
      {showContent && resolved ? (
        <>
          <ListingReviewBody result={resolved} />
          <ListingReviewFixPrompt
            businessName={businessName}
            result={resolved}
          />
          <ListingReviewFoot result={resolved} />
        </>
      ) : null}
    </section>
  );
};
