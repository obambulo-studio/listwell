import type { MetadataRoute } from "next";

import { robotsDirectives } from "@/lib/site-metadata";

const robots = (): MetadataRoute.Robots => robotsDirectives();

export default robots;
