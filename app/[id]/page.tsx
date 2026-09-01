import { notFound } from "next/navigation";
import { z } from "zod";
import { ReportClient } from "@/components/report-client";
import { checksForCategory } from "@/lib/checks/registry";
import { getBusiness } from "@/lib/db";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await params);
  const business = await getBusiness(id);
  return {
    title: business ? `${business.name} report` : "Report",
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await params);
  const business = await getBusiness(id);
  if (!business) {
    notFound();
  }

  return <ReportClient initialBusiness={business} checks={checksForCategory(business.category)} />;
}
