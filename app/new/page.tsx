import { NewAuditForm } from "@/components/new-audit-form";
import { firstSearchParam, parseCategoryParam, parseProfilesParam } from "@/lib/query-params";

export const metadata = {
  title: "Confirm listings",
};

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const businessName = firstSearchParam(params.businessName) ?? "";
  const categoryId = parseCategoryParam(firstSearchParam(params.categoryId));
  const profiles = parseProfilesParam(firstSearchParam(params.discoveredProfiles));

  return (
    <NewAuditForm businessName={businessName} categoryId={categoryId} initialProfiles={profiles} />
  );
}
