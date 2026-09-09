import type { Metadata } from "next";

import { ListwellChat } from "@/components/listwell-chat";

export const metadata: Metadata = {
  description:
    "Chat-first local and website SEO audit. Answer a few questions, get a basic report, then upgrade for fixes and automation.",
  title: "Check your listings",
};

const HomePage = () => <ListwellChat />;

export default HomePage;
