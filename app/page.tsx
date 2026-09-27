import type { Metadata } from "next";

import { ListwellChat } from "@/components/listwell-chat";
import { REPORT_ONCE_PRICE } from "@/lib/polar";

export const metadata: Metadata = {
  description: `Check Google Business Profile, listings, and website SEO for your Australian business. Free basic report; full fix steps from ${REPORT_ONCE_PRICE}.`,
  title: "Check your listings",
};

const HomePage = () => <ListwellChat />;

export default HomePage;
