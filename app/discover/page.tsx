import { DiscoverClient } from "@/components/discover-client";
import { firstSearchParam, parseCategoryParam } from "@/lib/query-params";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const businessName = firstSearchParam(params.businessName) ?? "";
  const websiteUrl = firstSearchParam(params.websiteUrl);
  const categoryId = parseCategoryParam(firstSearchParam(params.categoryId));
  const listingUrl = firstSearchParam(params.listingUrl);
  const address = firstSearchParam(params.address);
  const facebookUrl = firstSearchParam(params.facebookUrl);
  const instagramUsername = firstSearchParam(params.instagramUsername);

  return (
    <section className="vbg-opening">
      {businessName ? (
        <DiscoverClient
          businessName={businessName}
          websiteUrl={websiteUrl}
          categoryId={categoryId}
          listingUrl={listingUrl}
          address={address}
          facebookUrl={facebookUrl}
          instagramUsername={instagramUsername}
        />
      ) : (
        <p className="vbg-lede">Enter a business name on the home page to start an audit.</p>
      )}
    </section>
  );
}
