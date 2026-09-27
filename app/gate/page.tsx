import type { Metadata } from "next";

import { SiteGatePage } from "@/components/site-gate-page";
import { firstSearchParam, safeAppPath } from "@/lib/query-params";

export const metadata: Metadata = {
  description:
    "Listwell audits local listings and websites for SEO. Request early access or enter your invite password.",
  robots: {
    follow: true,
    index: true,
  },
  title: "Early access",
};

const GatePage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const nextPath = safeAppPath(firstSearchParam(params.next), "/");
  return <SiteGatePage nextPath={nextPath} />;
};

export default GatePage;
