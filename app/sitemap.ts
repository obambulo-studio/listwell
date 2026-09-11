import type { MetadataRoute } from "next";

import { sitemapEntries } from "@/lib/site-metadata";

const sitemap = (): MetadataRoute.Sitemap => sitemapEntries();

export default sitemap;
