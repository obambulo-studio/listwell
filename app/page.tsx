import type { Metadata } from "next";

import { HomeRoute } from "@/components/home-page";

export const metadata: Metadata = {
  description:
    "Local and website SEO audit for businesses. Free basic check, then upgrade for fix steps and automation.",
  title: "Listwell",
};

const HomePage = () => <HomeRoute />;

export default HomePage;
