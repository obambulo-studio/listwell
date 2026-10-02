import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getBusiness } from "@/lib/data";
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

  redirect(`/${business.id}?listings=1`);
};

export default EditPage;
