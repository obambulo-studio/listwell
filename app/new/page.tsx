import { NewAuditForm } from "@/components/new-audit-form";
import { getBusiness } from "@/lib/data";
import { businessToProfiles } from "@/lib/profiles";
import {
  firstSearchParam,
  parseCategoryParam,
  parseProfilesParam,
} from "@/lib/query-params";
import {
  canonicalFor,
  listwellSocialMetadata,
  withListwellTitle,
} from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

const description =
  "Confirm the category, locations, and profile URLs before the audit runs.";
const title = "Confirm listings";

export const metadata = {
  alternates: canonicalFor("/new"),
  description,
  title,
  ...listwellSocialMetadata({
    description,
    pathname: "/new",
    title: withListwellTitle(title),
  }),
};

const NewAuditPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const existingId = firstSearchParam(params.id);
  if (existingId) {
    const business = await getBusiness(existingId);
    if (business) {
      return (
        <NewAuditForm
          businessName={business.name}
          categoryId={business.category}
          categoryLabel={business.categoryLabel}
          initialProfiles={businessToProfiles(business)}
          initialAddress={
            business.locations.find((location) => location.address)?.address ??
            undefined
          }
          existingId={business.id}
        />
      );
    }
  }

  const businessName = firstSearchParam(params.businessName) ?? "";
  const categoryId = parseCategoryParam(firstSearchParam(params.categoryId));
  const profiles = parseProfilesParam(
    firstSearchParam(params.discoveredProfiles)
  );
  const address = firstSearchParam(params.address);

  return (
    <NewAuditForm
      businessName={businessName}
      categoryId={categoryId}
      initialProfiles={profiles}
      initialAddress={address}
    />
  );
};

export default NewAuditPage;
