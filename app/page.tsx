import type { Metadata } from "next";

import { HomeRoute } from "@/components/home-page";
import { JsonLd } from "@/lib/json-ld";
import { canonicalFor } from "@/lib/site-metadata";
import { homeStructuredData } from "@/lib/structured-data";

export const metadata: Metadata = {
  alternates: canonicalFor("/"),
  description:
    "Local and website SEO audit for businesses. Free basic check, then upgrade for fix steps and automation.",
  title: "Listwell",
};

const HomePage = () => (
  <>
    <JsonLd data={homeStructuredData()} />
    <HomeRoute />
  </>
);

export default HomePage;
