import type { Metadata } from "next";

import { HomeRoute } from "@/components/home-page";
import { JsonLd } from "@/lib/json-ld";
import {
  canonicalFor,
  LISTWELL_HOME_TITLE,
  listwellSocialMetadata,
} from "@/lib/site-metadata";
import { homeStructuredData } from "@/lib/structured-data";

const description =
  "Local and website SEO audit for businesses. Free basic check, then upgrade for fix steps and automation.";

export const metadata: Metadata = {
  alternates: canonicalFor("/"),
  description,
  title: {
    absolute: LISTWELL_HOME_TITLE,
  },
  ...listwellSocialMetadata({
    description,
    pathname: "/",
    title: LISTWELL_HOME_TITLE,
  }),
};

const HomePage = () => (
  <>
    <JsonLd data={homeStructuredData()} />
    <HomeRoute />
  </>
);

export default HomePage;
