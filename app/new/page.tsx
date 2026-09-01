import { parseCategoryParam, parseProfilesParam } from "@/components/discover-client";
import { NewAuditForm } from "@/components/new-audit-form";

export const metadata = {
  title: "Confirm listings",
};

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const businessName = typeof params.businessName === "string" ? params.businessName : "";
  const categoryId = parseCategoryParam(typeof params.categoryId === "string" ? params.categoryId : undefined);
  const profiles = parseProfilesParam(typeof params.discoveredProfiles === "string" ? params.discoveredProfiles : undefined);

  return (
    <NewAuditForm businessName={businessName} categoryId={categoryId} initialProfiles={profiles} />
  );
}
