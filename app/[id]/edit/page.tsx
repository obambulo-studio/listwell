import { notFound } from "next/navigation";
import { z } from "zod";
import { NewAuditForm } from "@/components/new-audit-form";
import { getBusiness } from "@/lib/db";
import { businessToProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await params);
  const business = await getBusiness(id);
  return {
    title: business ? `Edit ${business.name}` : "Edit audit",
  };
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await params);
  const business = await getBusiness(id);
  if (!business) {
    notFound();
  }

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
