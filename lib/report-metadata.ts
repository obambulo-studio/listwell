import type { Metadata } from "next";

import { isFileLikePathId } from "@/lib/site-metadata";

export type LoadBusinessName = (id: string) => Promise<{ name: string } | null>;

const notFoundMetadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Report not found",
};

/**
 * Metadata for `/[id]` and `/[id]/edit`. A file-like id (a bot probe such as
 * `xmlrpc.php`) gets fallback metadata instead of `notFound()`, because a
 * throw from `generateMetadata` is logged as an unhandled exception. The page
 * itself still returns the 404.
 */
export const reportRouteMetadata = async (
  id: string,
  loadBusiness: LoadBusinessName,
  titles: { found: (name: string) => string; missing: string }
): Promise<Metadata> => {
  if (isFileLikePathId(id)) {
    return notFoundMetadata;
  }
  const business = await loadBusiness(id);
  return {
    title: business ? titles.found(business.name) : titles.missing,
  };
};
