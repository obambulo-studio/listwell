import { CHECK_CATALOG_INDEX } from "./checks/catalog-index";

export const HOMEPAGE_CHECK_COUNT = CHECK_CATALOG_INDEX.length;

export type HomepageCheckGridIcon =
  | "ai-visibility"
  | "brand-consistency"
  | "competitor-comparison"
  | "emails"
  | "food-delivery"
  | "google-business"
  | "local-search-research"
  | "on-page-seo"
  | "reviews-reputation"
  | "seo-research"
  | "social"
  | "structured-data"
  | "team-access"
  | "technical"
  | "trends-monitoring"
  | "web-analytics";

export interface HomepageCheckGridGroup {
  description: string;
  icon: HomepageCheckGridIcon;
  id: string;
  title: string;
}

/** Homepage `#checks` grid: channel-aligned summaries, not every catalog title. */
const HOMEPAGE_CHECK_GRID_GROUPS: HomepageCheckGridGroup[] = [
  {
    description:
      "Listing, opening hours, photo gallery, and primary category on Google.",
    icon: "google-business",
    id: "google-business-profile",
    title: "Google Business Profile",
  },
  {
    description:
      "Google star rating and review count vs benchmarks local searchers trust.",
    icon: "reviews-reputation",
    id: "reviews-reputation",
    title: "Reviews & reputation",
  },
  {
    description:
      "Facebook, Instagram, LinkedIn, TikTok, YouTube, banners, and post freshness.",
    icon: "social",
    id: "social-profiles",
    title: "Social profiles",
  },
  {
    description:
      "Phone, website, and NAP on Google and site, plus matching social avatars.",
    icon: "brand-consistency",
    id: "brand-listing-consistency",
    title: "Brand & listing consistency",
  },
  {
    description:
      "Deliveroo, DoorDash, Menulog, and Uber Eats for food service businesses.",
    icon: "food-delivery",
    id: "food-delivery",
    title: "Food delivery",
  },
  {
    description:
      "Page titles, meta descriptions, canonical URLs, and Open Graph share images.",
    icon: "on-page-seo",
    id: "on-page-seo",
    title: "On-page SEO",
  },
  {
    description:
      "LocalBusiness JSON-LD, site address and hours, NAP, click-to-call.",
    icon: "structured-data",
    id: "structured-data",
    title: "Structured data & contact",
  },
  {
    description:
      "HTTPS, loading, mobile layout, speed, robots.txt, and XML sitemap.",
    icon: "technical",
    id: "technical-accessibility",
    title: "Technical & accessibility",
  },
  {
    description:
      "Up to four local peers on full and monthly reports and where they pass checks first.",
    icon: "competitor-comparison",
    id: "competitor-comparison",
    title: "Nearby competitor comparison",
  },
  {
    description:
      "Map-grid phrases and organic rank for your market, monthly on reports.",
    icon: "local-search-research",
    id: "local-search-research",
    title: "Local search research",
  },
  {
    description:
      "Score, reviews, and map-pack trends with month-on-month change and scan emails.",
    icon: "trends-monitoring",
    id: "trends-monitoring",
    title: "Trends & monitoring",
  },
  {
    description:
      "Robots.txt and homepage rules so ChatGPT, Perplexity, and Claude can cite you.",
    icon: "ai-visibility",
    id: "ai-visibility",
    title: "AI visibility",
  },
  {
    description:
      "Volume, backlinks, domain estimate, AI citations, review gap, and listing posts on continued reports.",
    icon: "seo-research",
    id: "seo-research",
    title: "SEO research",
  },
  {
    description:
      "First-party pageview counting. Turn it on per site. The first 5,000 events each month are free, then you pay for the account band you use.",
    icon: "web-analytics",
    id: "web-analytics",
    title: "Web analytics",
  },
  {
    description:
      "Optional notifications when monthly scans finish, with scores, trends, and links to reports.",
    icon: "emails",
    id: "emails",
    title: "Email reports",
  },
  {
    description:
      "Invite team members to view one business report without billing or your other listings.",
    icon: "team-access",
    id: "team-access",
    title: "Team access",
  },
];

export const getHomepageCheckGridGroups =
  (): readonly HomepageCheckGridGroup[] => HOMEPAGE_CHECK_GRID_GROUPS;
