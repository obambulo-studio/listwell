import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { mdcToMarkdown } from "../lib/markdown";

const checksDir = path.join(process.cwd(), "content/checks");
const files = readdirSync(checksDir).filter((file) => file.endsWith(".md"));

interface Points {
  food: number;
  retail: number;
  services: number;
  other: number;
}

type BusinessCategory = "food" | "retail" | "services" | "other";

const POINT_PATTERNS = {
  food: /^\s+food:\s*(?<value>\d+)/mu,
  other: /^\s+other:\s*(?<value>\d+)/mu,
  retail: /^\s+retail:\s*(?<value>\d+)/mu,
  services: /^\s+services:\s*(?<value>\d+)/mu,
} as const;

const parsePoints = (block: string): Points => {
  const points: Points = { food: 0, other: 0, retail: 0, services: 0 };
  for (const key of ["food", "retail", "services", "other"] as const) {
    const value = block.match(POINT_PATTERNS[key])?.groups?.value;
    if (value) {
      points[key] = Number(value);
    }
  }
  return points;
};

const parseBusinessCategories = (block: string): BusinessCategory[] => {
  const categories: BusinessCategory[] = [];
  const categoryBlock = block.match(
    /businessCategories:\n(?<items>(?:\s+-\s+\w+\n?)*)/u
  );
  if (!categoryBlock?.groups?.items) {
    return categories;
  }
  for (const line of categoryBlock.groups.items.split("\n")) {
    const item = line.match(/-\s+(?<category>food|retail|services|other)/u)
      ?.groups?.category;
    if (
      item === "food" ||
      item === "retail" ||
      item === "services" ||
      item === "other"
    ) {
      categories.push(item);
    }
  }
  return categories;
};

const parseFrontmatter = (
  raw: string
): {
  channelCategory: string;
  points: Points;
  businessCategories: BusinessCategory[] | null;
  title: string;
} => {
  const [, frontmatter] =
    raw.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/u) ?? [];
  if (!frontmatter) {
    throw new Error("Missing frontmatter");
  }
  const channel = frontmatter
    .match(/^channelCategory:\s*(?<value>.+)$/mu)
    ?.groups?.value?.trim();
  if (!channel) {
    throw new Error("Missing channelCategory");
  }

  const categories = parseBusinessCategories(frontmatter);
  const title = raw.match(/^#\s+(?<title>.+)$/mu)?.groups?.title?.trim();
  if (!title) {
    throw new Error("Missing title");
  }

  return {
    businessCategories: categories.length > 0 ? categories : null,
    channelCategory: channel,
    points: parsePoints(frontmatter),
    title,
  };
};

const catalog = files
  .map((file) => {
    const id = file.replace(/\.md$/u, "");
    const raw = readFileSync(path.join(checksDir, file), "utf-8");
    const meta = parseFrontmatter(raw);
    return {
      body: mdcToMarkdown(raw),
      businessCategories: meta.businessCategories,
      channelCategory: meta.channelCategory,
      id,
      points: meta.points,
      title: meta.title,
    };
  })
  .toSorted((a, b) => a.id.localeCompare(b.id));

const output = `import { checkDefinitionSchema, type CheckDefinition } from "./types";

export const CHECK_CATALOG: CheckDefinition[] = checkDefinitionSchema.array().parse(${JSON.stringify(catalog, null, 2)});
`;

writeFileSync(path.join(process.cwd(), "lib/checks/catalog.ts"), output);
console.log(`Wrote ${catalog.length} checks to lib/checks/catalog.ts`);
