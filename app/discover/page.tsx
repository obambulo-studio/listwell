import { DiscoverClient, parseCategoryParam } from "@/components/discover-client";

export const metadata = {
  title: "Discovering your listings",
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const businessName = typeof params.businessName === "string" ? params.businessName : "";
  const websiteUrl = typeof params.websiteUrl === "string" ? params.websiteUrl : undefined;
  const categoryId = parseCategoryParam(typeof params.categoryId === "string" ? params.categoryId : undefined);

  return (
    <section className="vbg-opening">
      <h1 className="vbg-title">Discovering your online presence</h1>
      {businessName ? (
        <DiscoverClient businessName={businessName} websiteUrl={websiteUrl} categoryId={categoryId} />
      ) : (
        <p className="vbg-lede">Enter a business name on the home page to start an audit.</p>
      )}
    </section>
  );
}
