import { DiscoverClient } from "@/components/discover-client";
import { firstSearchParam, parseCategoryParam } from "@/lib/query-params";

export const metadata = {
  title: "Discovering your listings",
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const businessName = firstSearchParam(params.businessName) ?? "";
  const websiteUrl = firstSearchParam(params.websiteUrl);
  const categoryId = parseCategoryParam(firstSearchParam(params.categoryId));
  const googlePlaceId = firstSearchParam(params.googlePlaceId);
  const appleMapsId = firstSearchParam(params.appleMapsId);

  return (
    <section className="vbg-opening">
      <h1 className="vbg-title">Discovering your online presence</h1>
      {businessName ? (
        <DiscoverClient
          businessName={businessName}
          websiteUrl={websiteUrl}
          categoryId={categoryId}
          googlePlaceId={googlePlaceId}
          appleMapsId={appleMapsId}
        />
      ) : (
        <p className="vbg-lede">Enter a business name on the home page to start an audit.</p>
      )}
    </section>
  );
}
