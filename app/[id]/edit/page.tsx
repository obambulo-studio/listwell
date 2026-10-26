import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getBusiness } from "@/lib/data";
import { reportRouteMetadata } from "@/lib/report-metadata";
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
  return await reportRouteMetadata(
    id,
    getBusiness,
    {
      description: (name) =>
        name ? `Edit the audit for ${name}.` : "Edit a Listwell audit.",
      found: (name) => `Edit ${name}`,
      missing: "Edit audit",
    },
    `/${id}/edit`
  );
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
