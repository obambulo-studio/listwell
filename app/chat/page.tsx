import type { Metadata } from "next";

import { ListwellChat } from "@/components/listwell-chat";
import {
  canonicalFor,
  listwellSocialMetadata,
  withListwellTitle,
} from "@/lib/site-metadata";

const description =
  "Enter your business name and receive a report for free in under a minute.";
const title = "Check your listings";

export const metadata: Metadata = {
  alternates: canonicalFor("/chat"),
  description,
  title,
  ...listwellSocialMetadata({
    description,
    pathname: "/chat",
    title: withListwellTitle(title),
  }),
};

const ChatPage = () => <ListwellChat />;

export default ChatPage;
