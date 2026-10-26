import type { Metadata } from "next";

import {
  isFileLikePathId,
  listwellSocialMetadata,
  withListwellTitle,
} from "@/lib/site-metadata";

export type LoadBusinessName = (id: string) => Promise<{ name: string } | null>;

const notFoundTitle = "Report not found";
const notFoundDescription = "This Listwell report could not be found.";

const notFoundMetadata = (pathname: string): Metadata => ({
  description: notFoundDescription,
  robots: { follow: false, index: false },
  title: notFoundTitle,
  ...listwellSocialMetadata({
    description: notFoundDescription,
    pathname,
    title: withListwellTitle(notFoundTitle),
  }),
});

/**
 * Metadata for `/[id]` and `/[id]/edit`. A file-like id (a bot probe such as
 * `xmlrpc.php`) gets fallback metadata instead of `notFound()`, because a
 * throw from `generateMetadata` is logged as an unhandled exception. The page
 * itself still returns the 404.
 */
export const reportRouteMetadata = async (
  id: string,
  loadBusiness: LoadBusinessName,
  titles: {
    description: (name: string | null) => string;
    found: (name: string) => string;
    missing: string;
  },
  pathname: string
): Promise<Metadata> => {
  if (isFileLikePathId(id)) {
    return notFoundMetadata(pathname);
  }
  const business = await loadBusiness(id);
  const title = business ? titles.found(business.name) : titles.missing;
  const description = titles.description(business ? business.name : null);
  return {
    description,
    title,
    ...listwellSocialMetadata({
      description,
      pathname,
      title: withListwellTitle(title),
    }),
  };
};
