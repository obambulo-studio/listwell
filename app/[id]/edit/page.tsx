import { notFound } from "next/navigation";
import { z } from "zod";

import { NewAuditForm } from "@/components/new-audit-form";
import { getBusiness } from "@/lib/data";
import { businessToProfiles } from "@/lib/profiles";
import { isFileLikePathId } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = paramsSchema.parse(await params);
  if (isFileLikePathId(id)) {
    notFound();
  }
  const business = await getBusiness(id);
  return {
    title: business ? `Edit ${business.name}` : "Edit audit",
  };
};

const EditPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = paramsSchema.parse(await params);
  if (isFileLikePathId(id)) {
    notFound();
  }
  const business = await getBusiness(id);
  if (!business) {
    notFound();
  }

  return (
    <NewAuditForm
      businessName={business.name}
      categoryId={business.category}
      initialProfiles={businessToProfiles(business)}
      initialAddress={
        business.locations.find((location) => location.address)?.address ??
        undefined
      }
      existingId={business.id}
    />
  );
};

export default EditPage;
