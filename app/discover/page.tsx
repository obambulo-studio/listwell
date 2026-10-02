import type { Metadata } from "next";

import { ButtonLink } from "@/components/atoms/button";
import { DiscoverClient } from "@/components/discover-client";
import { firstSearchParam, parseCategoryParam } from "@/lib/query-params";

export const metadata: Metadata = {
  description:
    "Match a business name to Google Business Profile, Apple Maps, a website, and social profiles.",
  title: "Find your listing",
};

const DiscoverPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const businessName = firstSearchParam(params.businessName) ?? "";
  const websiteUrl = firstSearchParam(params.websiteUrl);
  const categoryId = parseCategoryParam(firstSearchParam(params.categoryId));
  const googlePlaceId = firstSearchParam(params.googlePlaceId);
  const appleMapsId = firstSearchParam(params.appleMapsId);
  const listingUrl = firstSearchParam(params.listingUrl);
  const address = firstSearchParam(params.address);
  const facebookUrl = firstSearchParam(params.facebookUrl);
  const instagramUsername = firstSearchParam(params.instagramUsername);
  const near = firstSearchParam(params.near);

  return (
    <section className="listwell-page">
      {businessName ? (
        <DiscoverClient
          businessName={businessName}
          websiteUrl={websiteUrl}
          categoryId={categoryId}
          googlePlaceId={googlePlaceId}
          appleMapsId={appleMapsId}
          listingUrl={listingUrl}
          address={address}
          facebookUrl={facebookUrl}
          instagramUsername={instagramUsername}
          near={near}
        />
      ) : (
        <div className="listwell-panel">
          <div className="listwell-panel__body">
            <p className="listwell-panel__text">
              Enter a business name on the home page to start an audit.
            </p>
          </div>
          <div className="listwell-panel__foot">
            <ButtonLink variant="primary" href="/">
              Check a business
            </ButtonLink>
          </div>
        </div>
      )}
    </section>
  );
};

export default DiscoverPage;
