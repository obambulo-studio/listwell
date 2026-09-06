import { NewAuditForm } from "@/components/new-audit-form";
import { getBusiness } from "@/lib/db";
import { businessToProfiles } from "@/lib/profiles";
import { firstSearchParam, parseCategoryParam, parseProfilesParam } from "@/lib/query-params";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Confirm listings",
};

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const existingId = firstSearchParam(params.id);
  if (existingId) {
    const business = await getBusiness(existingId);
    if (business) {
      return (
        <NewAuditForm
          businessName={business.name}
          categoryId={business.category}
          initialProfiles={businessToProfiles(business)}
          initialAddress={business.locations.find((location) => location.address)?.address ?? undefined}
          existingId={business.id}
        />
      );
    }
  }

  const businessName = firstSearchParam(params.businessName) ?? "";
  const categoryId = parseCategoryParam(firstSearchParam(params.categoryId));
  const profiles = parseProfilesParam(firstSearchParam(params.discoveredProfiles));
  const address = firstSearchParam(params.address);

  return (
    <NewAuditForm
      businessName={businessName}
      categoryId={categoryId}
      initialProfiles={profiles}
      initialAddress={address}
    />
  );
}
