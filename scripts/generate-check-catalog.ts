import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mdcToMarkdown } from "../lib/markdown";

const checksDir = join(process.cwd(), "content/checks");
const files = readdirSync(checksDir).filter((file) => file.endsWith(".md"));

type Points = {
  food: number;
  retail: number;
  services: number;
  other: number;
};

function parseFrontmatter(raw: string): {
  channelCategory: string;
  points: Points;
  businessCategories: Array<"food" | "retail" | "services" | "other"> | null;
  title: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) {
    throw new Error("Missing frontmatter");
  }
  const block = match[1];
  const channel = block.match(/^channelCategory:\s*(.+)$/m)?.[1]?.trim();
  if (!channel) {
    throw new Error("Missing channelCategory");
  }

  const points: Points = { food: 0, retail: 0, services: 0, other: 0 };
  for (const key of ["food", "retail", "services", "other"] as const) {
    const value = block.match(new RegExp(`^\\s+${key}:\\s*(\\d+)`, "m"))?.[1];
    if (value) {
      points[key] = Number(value);
    }
  }

  const categories: Array<"food" | "retail" | "services" | "other"> = [];
  const categoryBlock = block.match(/businessCategories:\n((?:\s+-\s+\w+\n?)*)/);
  if (categoryBlock?.[1]) {
    for (const line of categoryBlock[1].split("\n")) {
      const item = line.match(/-\s+(food|retail|services|other)/)?.[1];
      if (item === "food" || item === "retail" || item === "services" || item === "other") {
        categories.push(item);
      }
    }
  }

  const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) {
    throw new Error("Missing title");
  }

  return {
    channelCategory: channel,
    points,
    businessCategories: categories.length > 0 ? categories : null,
    title,
  };
}

const catalog = files
  .map((file) => {
    const id = file.replace(/\.md$/, "");
    const raw = readFileSync(join(checksDir, file), "utf8");
    const meta = parseFrontmatter(raw);
    return {
      id,
      title: meta.title,
      channelCategory: meta.channelCategory,
      points: meta.points,
      businessCategories: meta.businessCategories,
      body: mdcToMarkdown(raw),
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const output = `import { checkDefinitionSchema, type CheckDefinition } from "./types";

export const CHECK_CATALOG: CheckDefinition[] = checkDefinitionSchema.array().parse(${JSON.stringify(catalog, null, 2)});
`;

writeFileSync(join(process.cwd(), "lib/checks/catalog.ts"), output);
console.log(`Wrote ${catalog.length} checks to lib/checks/catalog.ts`);
