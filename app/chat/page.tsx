import type { Metadata } from "next";

import { ListwellChat } from "@/components/listwell-chat";
import { canonicalFor } from "@/lib/site-metadata";

export const metadata: Metadata = {
  alternates: canonicalFor("/chat"),
  description:
    "Enter your business name and receive a report for free in under a minute.",
  title: "Check your listings",
};

const ChatPage = () => <ListwellChat />;

export default ChatPage;
