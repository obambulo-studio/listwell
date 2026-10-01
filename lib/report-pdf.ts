import { z } from "zod";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 48;
const FOOTER_RESERVE = 56;
const CONTINUATION_HEADER = 34;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const STATUS_COLUMN = 90;

const INK = [0.15, 0.15, 0.16] as const;
const MUTED = [0.4, 0.41, 0.43] as const;
const FAINT = [0.52, 0.53, 0.55] as const;
const RULE = [0.86, 0.86, 0.88] as const;
const TRACK = [0.92, 0.92, 0.93] as const;
const GREEN = [0.2, 0.5, 0.36] as const;
const AMBER = [0.7, 0.4, 0.14] as const;
const GRAY = [0.62, 0.63, 0.65] as const;

type Rgb = readonly [number, number, number];

const reportPdfCheckSchema = z.object({
  category: z.string(),
  detail: z.string().optional(),
  status: z.string(),
  title: z.string(),
});

const reportPdfActionSectionSchema = z.object({
  actions: z.array(z.string()),
  title: z.string(),
});

export const reportPdfEditionSchema = z.enum(["preview", "final"]);

export const reportPdfInputSchema = z.object({
  businessName: z.string(),
  checks: z.array(reportPdfCheckSchema),
  edition: reportPdfEditionSchema.optional(),
  generatedAt: z.string().optional(),
  needsWork: z.number().int().nonnegative(),
  nextActionSections: z.array(reportPdfActionSectionSchema).optional(),
  nextActions: z.array(z.string()),
  overview: z.array(z.string()),
  passing: z.number().int().nonnegative(),
  score: z.number().finite(),
  skipped: z.number().int().nonnegative(),
});

export type ReportPdfCheck = z.infer<typeof reportPdfCheckSchema>;
export type ReportPdfActionSection = z.infer<
  typeof reportPdfActionSectionSchema
>;
export type ReportPdfEdition = z.infer<typeof reportPdfEditionSchema>;
export type ReportPdfInput = z.infer<typeof reportPdfInputSchema>;

type DrawCommand =
  | { color: Rgb; h: number; op: "fill"; w: number; x: number; y: number }
  | {
      bold: boolean;
      color: Rgb;
      op: "text";
      size: number;
      text: string;
      x: number;
      y: number;
    };

interface FlowBlock {
  commands: (top: number) => DrawCommand[];
  height: number;
  keepWithNext: boolean;
}

const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

if (HELVETICA_WIDTHS.length !== 95) {
  throw new Error("Helvetica width table is incomplete");
}

const WINANSI_EXTRA: Record<string, string> = {
  "·": "\\267",
  "–": "\\226",
  "—": "\\227",
  "‘": "\\221",
  "’": "\\222",
  "“": "\\223",
  "”": "\\224",
  "•": "\\225",
};

const charUnits = (char: string): number => {
  if (char === "·" || char === "•") {
    return 278;
  }
  const code = char.codePointAt(0);
  if (code === undefined || code < 32 || code > 126) {
    return 500;
  }
  return HELVETICA_WIDTHS[code - 32] ?? 500;
};

const textWidth = (value: string, size: number, bold: boolean): number => {
  let units = 0;
  for (const char of value) {
    units += charUnits(char);
  }
  const boldScale = bold ? 1.1 : 1;
  return (units / 1000) * size * boldScale;
};

const normalize = (value: string): string => {
  let out = "";
  for (const char of value) {
    if (char === "≥") {
      out += ">=";
      continue;
    }
    if (char === "≤") {
      out += "<=";
      continue;
    }
    if (char === "\n" || char === "\t") {
      out += " ";
      continue;
    }
    if (WINANSI_EXTRA[char] !== undefined || (char >= " " && char <= "~")) {
      out += char;
    }
  }
  return out;
};

const escapePdfText = (value: string): string => {
  let out = "";
  for (const char of normalize(value)) {
    const extra = WINANSI_EXTRA[char];
    if (extra !== undefined) {
      out += extra;
      continue;
    }
    if (char === "\\") {
      out += "\\\\";
      continue;
    }
    if (char === "(") {
      out += "\\(";
      continue;
    }
    if (char === ")") {
      out += "\\)";
      continue;
    }
    out += char;
  }
  return out;
};

const wrapText = (
  value: string,
  size: number,
  bold: boolean,
  maxWidth: number
): string[] => {
  const words = normalize(value)
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";

  const commit = (): void => {
    if (current.length > 0) {
      lines.push(current);
      current = "";
    }
  };

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      current = candidate;
      continue;
    }
    commit();
    if (textWidth(word, size, bold) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      const next = `${chunk}${char}`;
      if (textWidth(next, size, bold) > maxWidth && chunk.length > 0) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  }
  commit();
  return lines;
};

const formatNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

const rgb = (color: Rgb): string =>
  color.map((channel) => formatNumber(channel)).join(" ");

const emit = (commands: DrawCommand[]): string => {
  const lines: string[] = [];
  for (const command of commands) {
    if (command.op === "fill") {
      lines.push(
        `${rgb(command.color)} rg`,
        `${formatNumber(command.x)} ${formatNumber(command.y)} ${formatNumber(command.w)} ${formatNumber(command.h)} re`,
        "f"
      );
      continue;
    }
    const font = command.bold ? "F2" : "F1";
    lines.push(
      "BT",
      `${rgb(command.color)} rg`,
      `/${font} ${formatNumber(command.size)} Tf`,
      `1 0 0 1 ${formatNumber(command.x)} ${formatNumber(command.y)} Tm`,
      `(${escapePdfText(command.text)}) Tj`,
      "ET"
    );
  }
  return lines.join("\n");
};

const gap = (height: number, keepWithNext = false): FlowBlock => ({
  commands: () => [],
  height,
  keepWithNext,
});

const textLineBlocks = (input: {
  bold: boolean;
  color: Rgb;
  keepWithNext?: boolean;
  leading: number;
  size: number;
  text: string;
  width?: number;
  x?: number;
}): FlowBlock[] => {
  const width = input.width ?? CONTENT_WIDTH;
  const x = input.x ?? MARGIN_X;
  const lines = wrapText(input.text, input.size, input.bold, width);
  return lines.map((line, index) => ({
    commands: (top) => [
      {
        bold: input.bold,
        color: input.color,
        op: "text",
        size: input.size,
        text: line,
        x,
        y: top - input.size * 0.8,
      },
    ],
    height: input.leading,
    keepWithNext: input.keepWithNext === true && index === lines.length - 1,
  }));
};

const ruleBlock = (): FlowBlock => ({
  commands: (top) => [
    {
      color: RULE,
      h: 0.6,
      op: "fill",
      w: CONTENT_WIDTH,
      x: MARGIN_X,
      y: top - 10,
    },
  ],
  height: 16,
  keepWithNext: false,
});

const rightText = (
  text: string,
  size: number,
  bold: boolean,
  y: number
): DrawCommand => ({
  bold,
  color: MUTED,
  op: "text",
  size,
  text,
  x: MARGIN_X + CONTENT_WIDTH - textWidth(text, size, bold),
  y,
});

const mastheadBlocks = (
  editionLabel: string,
  dateLabel: string
): FlowBlock[] => [
  {
    commands: (top) => {
      const y = top - 9;
      return [
        {
          bold: true,
          color: INK,
          op: "text",
          size: 11,
          text: "Listwell",
          x: MARGIN_X,
          y,
        },
        rightText(editionLabel, 10, false, y),
      ];
    },
    height: 16,
    keepWithNext: true,
  },
  ...textLineBlocks({
    bold: false,
    color: FAINT,
    leading: 13,
    size: 9,
    text: dateLabel,
  }),
  ruleBlock(),
];

const scoreBlock = (score: number): FlowBlock => {
  const rounded = Math.round(score);
  const label = `${rounded}%`;
  const suffix = " visibility";
  const size = 28;
  return {
    commands: (top) => {
      const y = top - size * 0.78;
      return [
        {
          bold: true,
          color: INK,
          op: "text",
          size,
          text: label,
          x: MARGIN_X,
          y,
        },
        {
          bold: false,
          color: MUTED,
          op: "text",
          size: 12,
          text: suffix,
          x: MARGIN_X + textWidth(label, size, true),
          y,
        },
      ];
    },
    height: 36,
    keepWithNext: false,
  };
};

const countsText = (input: ReportPdfInput): string => {
  const parts = [`${input.passing} passing`, `${input.needsWork} need work`];
  if (input.skipped > 0) {
    parts.push(`${input.skipped} skipped`);
  }
  return parts.join(" · ");
};

const allocationBlock = (
  passing: number,
  needsWork: number,
  skipped: number
): FlowBlock => ({
  commands: (top) => {
    const barY = top - 12;
    const barH = 6;
    const commands: DrawCommand[] = [
      {
        color: TRACK,
        h: barH,
        op: "fill",
        w: CONTENT_WIDTH,
        x: MARGIN_X,
        y: barY,
      },
    ];
    const segments = [
      { amount: passing, color: GREEN },
      { amount: needsWork, color: AMBER },
      { amount: skipped, color: GRAY },
    ].filter((segment) => segment.amount > 0);
    const total = passing + needsWork + skipped;
    if (total <= 0 || segments.length === 0) {
      return commands;
    }
    const gapWidth = 2;
    const usable = CONTENT_WIDTH - gapWidth * (segments.length - 1);
    let cursor = MARGIN_X;
    for (const segment of segments) {
      const width = (segment.amount / total) * usable;
      commands.push({
        color: segment.color,
        h: barH,
        op: "fill",
        w: width,
        x: cursor,
        y: barY,
      });
      cursor += width + gapWidth;
    }
    return commands;
  },
  height: 16,
  keepWithNext: false,
});

const legendBlock = (skipped: number): FlowBlock => {
  const items = [
    { color: GREEN, label: "Passing" },
    { color: AMBER, label: "Needs work" },
    ...(skipped > 0 ? [{ color: GRAY, label: "Skipped" }] : []),
  ];
  return {
    commands: (top) => {
      const y = top - 8;
      const commands: DrawCommand[] = [];
      let x = MARGIN_X;
      for (const item of items) {
        commands.push(
          {
            color: item.color,
            h: 6,
            op: "fill",
            w: 6,
            x,
            y,
          },
          {
            bold: false,
            color: MUTED,
            op: "text",
            size: 9,
            text: item.label,
            x: x + 10,
            y,
          }
        );
        x += 10 + textWidth(item.label, 9, false) + 16;
      }
      return commands;
    },
    height: 14,
    keepWithNext: false,
  };
};

const sectionHeading = (title: string): FlowBlock[] =>
  textLineBlocks({
    bold: true,
    color: INK,
    keepWithNext: true,
    leading: 18,
    size: 13,
    text: title,
  });

const actionBlocks = (rank: number, text: string): FlowBlock[] => {
  const prefix = `${rank}.`;
  const prefixWidth = textWidth(`${prefix} `, 10.5, true);
  const lines = wrapText(text, 10.5, false, CONTENT_WIDTH - prefixWidth);
  const safeLines = lines.length > 0 ? lines : [normalize(text)];
  return safeLines.map((line, index) => ({
    commands: (top) => {
      const y = top - 10.5 * 0.8;
      const commands: DrawCommand[] = [];
      if (index === 0) {
        commands.push({
          bold: true,
          color: INK,
          op: "text",
          size: 10.5,
          text: prefix,
          x: MARGIN_X,
          y,
        });
      }
      commands.push({
        bold: false,
        color: INK,
        op: "text",
        size: 10.5,
        text: line,
        x: MARGIN_X + prefixWidth,
        y,
      });
      return commands;
    },
    height: 15,
    keepWithNext: index === 0 && safeLines.length > 1,
  }));
};

const statusColor = (status: string): Rgb => {
  if (status === "Pass") {
    return GREEN;
  }
  if (status === "Needs work") {
    return AMBER;
  }
  return MUTED;
};

const statusRank = (status: string): number => {
  if (status === "Needs work") {
    return 0;
  }
  if (status === "Could not run") {
    return 1;
  }
  if (status === "Waiting" || status === "Idle") {
    return 2;
  }
  return 3;
};

const groupedChecks = (
  checks: ReportPdfCheck[]
): { category: string; checks: ReportPdfCheck[] }[] => {
  const groups = new Map<string, ReportPdfCheck[]>();
  for (const check of checks) {
    const existing = groups.get(check.category);
    if (existing) {
      existing.push(check);
    } else {
      groups.set(check.category, [check]);
    }
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    checks: items.toSorted(
      (left, right) => statusRank(left.status) - statusRank(right.status)
    ),
  }));
};

const categoryBlock = (name: string, count: number): FlowBlock => ({
  commands: (top) => {
    const y = top - 9;
    const countText = String(count);
    return [
      {
        bold: true,
        color: INK,
        op: "text",
        size: 11,
        text: name,
        x: MARGIN_X,
        y,
      },
      rightText(countText, 10, false, y),
    ];
  },
  height: 18,
  keepWithNext: true,
});

const statusRow = (
  status: string,
  title: string,
  detail: string | undefined
): FlowBlock => {
  const textX = MARGIN_X + STATUS_COLUMN;
  const textWidthLimit = CONTENT_WIDTH - STATUS_COLUMN;
  const titleLines = wrapText(title, 10.5, false, textWidthLimit);
  const trimmedDetail = detail?.trim() ?? "";
  const detailLines =
    trimmedDetail.length > 0
      ? wrapText(trimmedDetail, 9, false, textWidthLimit)
      : [];
  const safeTitle = titleLines.length > 0 ? titleLines : [normalize(title)];
  const titleLeading = 14;
  const detailLeading = 12;
  const height =
    safeTitle.length * titleLeading + detailLines.length * detailLeading + 6;
  return {
    commands: (top) => {
      const firstY = top - 10.5 * 0.8;
      const color = statusColor(status);
      const commands: DrawCommand[] = [
        {
          color,
          h: 5.5,
          op: "fill",
          w: 5.5,
          x: MARGIN_X,
          y: firstY + 0.5,
        },
        {
          bold: true,
          color,
          op: "text",
          size: 9,
          text: status,
          x: MARGIN_X + 10,
          y: firstY,
        },
      ];
      for (const [index, line] of safeTitle.entries()) {
        commands.push({
          bold: false,
          color: INK,
          op: "text",
          size: 10.5,
          text: line,
          x: textX,
          y: firstY - index * titleLeading,
        });
      }
      const detailStart = firstY - safeTitle.length * titleLeading;
      for (const [index, line] of detailLines.entries()) {
        commands.push({
          bold: false,
          color: MUTED,
          op: "text",
          size: 9,
          text: line,
          x: textX,
          y: detailStart - index * detailLeading,
        });
      }
      return commands;
    },
    height,
    keepWithNext: false,
  };
};

const pushChecks = (blocks: FlowBlock[], checks: ReportPdfCheck[]): void => {
  const groups = groupedChecks(checks);
  if (groups.length === 0) {
    return;
  }
  blocks.push(
    gap(18),
    ...sectionHeading("Checks"),
    gap(4, true),
    ...textLineBlocks({
      bold: false,
      color: MUTED,
      leading: 13,
      size: 9,
      text: "Needs work is listed first in each group.",
    }),
    gap(8)
  );
  for (const group of groups) {
    blocks.push(
      categoryBlock(group.category, group.checks.length),
      gap(4, true)
    );
    for (const check of group.checks) {
      blocks.push(statusRow(check.status, check.title, check.detail));
    }
    blocks.push(gap(6));
  }
};

const nextActionSections = (
  input: ReportPdfInput
): ReportPdfActionSection[] => {
  if (input.nextActionSections && input.nextActionSections.length > 0) {
    return input.nextActionSections;
  }
  if (input.nextActions.length > 0) {
    return [{ actions: input.nextActions, title: "" }];
  }
  return [];
};

const pushActions = (
  blocks: FlowBlock[],
  input: ReportPdfInput,
  edition: ReportPdfEdition
): void => {
  const sections = nextActionSections(input);
  const showSection =
    edition === "final" && (sections.length > 0 || input.overview.length > 0);
  if (!showSection) {
    return;
  }
  blocks.push(gap(16), ...sectionHeading("What to do next"), gap(6, true));
  if (sections.length === 0) {
    blocks.push(
      ...textLineBlocks({
        bold: false,
        color: MUTED,
        leading: 15,
        size: 10.5,
        text: "No failed checks to act on.",
      })
    );
    return;
  }
  let rank = 1;
  for (const section of sections) {
    if (section.title.trim().length > 0) {
      blocks.push(
        gap(8),
        ...textLineBlocks({
          bold: true,
          color: INK,
          keepWithNext: true,
          leading: 16,
          size: 11,
          text: section.title,
        }),
        gap(4, true)
      );
    }
    for (const action of section.actions) {
      blocks.push(...actionBlocks(rank, action));
      rank += 1;
    }
  }
};

const resolveEdition = (input: ReportPdfInput): ReportPdfEdition => {
  if (input.edition) {
    return input.edition;
  }
  return nextActionSections(input).length > 0 ? "final" : "preview";
};

const reportDate = (generatedAt: string | undefined): Date => {
  const date = generatedAt === undefined ? new Date() : new Date(generatedAt);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid report date");
  }
  return date;
};

const reportDateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  timeZone: "Australia/Sydney",
  year: "numeric",
});

const formatReportDate = (date: Date): string =>
  reportDateFormatter.format(date);

const editionLabel = (edition: ReportPdfEdition): string =>
  edition === "preview" ? "Preview" : "Full report";

const documentBlocks = (
  input: ReportPdfInput,
  edition: ReportPdfEdition,
  dateLabel: string
): FlowBlock[] => {
  const name = input.businessName.trim();
  const blocks: FlowBlock[] = [
    ...mastheadBlocks(editionLabel(edition), dateLabel),
    gap(12),
    ...textLineBlocks({
      bold: false,
      color: MUTED,
      keepWithNext: true,
      leading: 13,
      size: 9,
      text: "Visibility report",
    }),
  ];
  if (name.length > 0) {
    blocks.push(
      ...textLineBlocks({
        bold: true,
        color: INK,
        leading: 28,
        size: 22,
        text: name,
      })
    );
  }
  blocks.push(
    gap(8),
    scoreBlock(input.score),
    gap(2),
    ...textLineBlocks({
      bold: false,
      color: MUTED,
      leading: 14,
      size: 10,
      text: countsText(input),
    }),
    allocationBlock(input.passing, input.needsWork, input.skipped),
    gap(4),
    legendBlock(input.skipped)
  );
  if (edition === "preview") {
    blocks.push(
      gap(8),
      ...textLineBlocks({
        bold: false,
        color: MUTED,
        leading: 14,
        size: 10,
        text: "This preview lists check outcomes. The full report adds fix steps.",
      })
    );
  }
  if (input.overview.length > 0) {
    blocks.push(
      gap(18),
      ...sectionHeading("What the checks found"),
      gap(6, true)
    );
    for (const claim of input.overview) {
      blocks.push(
        ...textLineBlocks({
          bold: false,
          color: INK,
          leading: 15,
          size: 10.5,
          text: claim,
        }),
        gap(6)
      );
    }
  }
  const actionInput =
    edition === "preview"
      ? { ...input, nextActionSections: [], nextActions: [] }
      : input;
  pushActions(blocks, actionInput, edition);
  pushChecks(blocks, input.checks);
  return blocks.filter((block) => block.height > 0);
};

const contentLimit = (pageIndex: number): number =>
  PAGE_HEIGHT -
  MARGIN_TOP -
  FOOTER_RESERVE -
  (pageIndex === 0 ? 0 : CONTINUATION_HEADER);

const chainHeight = (blocks: FlowBlock[], start: number): number => {
  let total = 0;
  for (let index = start; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block === undefined) {
      break;
    }
    total += block.height;
    if (!block.keepWithNext) {
      break;
    }
  }
  return total;
};

const paginateBlocks = (blocks: FlowBlock[]): FlowBlock[][] => {
  const pages: FlowBlock[][] = [];
  let page: FlowBlock[] = [];
  let used = 0;
  const room = (): number => contentLimit(pages.length) - used;

  for (const [index, block] of blocks.entries()) {
    if (page.length > 0 && chainHeight(blocks, index) > room()) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(block);
    used += block.height;
  }
  if (page.length > 0) {
    pages.push(page);
  }
  return pages.length > 0 ? pages : [[]];
};

const truncateToWidth = (
  value: string,
  size: number,
  bold: boolean,
  maxWidth: number
): string => {
  const normalized = normalize(value);
  if (textWidth(normalized, size, bold) <= maxWidth) {
    return normalized;
  }
  let result = "";
  for (const char of normalized) {
    const next = `${result}${char}`;
    if (textWidth(`${next}...`, size, bold) > maxWidth) {
      break;
    }
    result = next;
  }
  return result.length > 0 ? `${result}...` : normalized;
};

const continuationHeader = (
  businessName: string,
  top: number
): DrawCommand[] => {
  const y = top - 11;
  const name = truncateToWidth(businessName, 10, false, CONTENT_WIDTH * 0.62);
  return [
    {
      bold: true,
      color: INK,
      op: "text",
      size: 10,
      text: "Listwell",
      x: MARGIN_X,
      y,
    },
    rightText(name, 10, false, y),
    {
      color: RULE,
      h: 0.6,
      op: "fill",
      w: CONTENT_WIDTH,
      x: MARGIN_X,
      y: top - 22,
    },
  ];
};

const pageFooter = (
  pageIndex: number,
  pageCount: number,
  label: string
): DrawCommand[] => {
  const y = 28;
  const left = `${label} · listwell.dev`;
  const pageText = `${pageIndex + 1} / ${pageCount}`;
  return [
    {
      color: RULE,
      h: 0.6,
      op: "fill",
      w: CONTENT_WIDTH,
      x: MARGIN_X,
      y: 42,
    },
    {
      bold: false,
      color: FAINT,
      op: "text",
      size: 9,
      text: left,
      x: MARGIN_X,
      y,
    },
    {
      bold: false,
      color: FAINT,
      op: "text",
      size: 9,
      text: pageText,
      x: MARGIN_X + CONTENT_WIDTH - textWidth(pageText, 9, false),
      y,
    },
  ];
};

const paintPage = (
  blocks: FlowBlock[],
  pageIndex: number,
  pageCount: number,
  running: { businessName: string; label: string }
): string => {
  const commands: DrawCommand[] = [];
  let top = PAGE_HEIGHT - MARGIN_TOP;
  if (pageIndex > 0) {
    commands.push(...continuationHeader(running.businessName, top));
    top -= CONTINUATION_HEADER;
  }
  for (const block of blocks) {
    commands.push(...block.commands(top));
    top -= block.height;
  }
  commands.push(...pageFooter(pageIndex, pageCount, running.label));
  return emit(commands);
};

const pdfBytes = (streams: string[], title: string): Uint8Array => {
  const fontRegularId = 3 + streams.length * 2;
  const fontBoldId = fontRegularId + 1;
  const infoId = fontBoldId + 1;
  const objects: string[] = [];
  const pageObjectIds = streams.map((_, index) => 3 + index * 2);
  objects.push(
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Count ${streams.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`
  );
  for (const [index, stream] of streams.entries()) {
    const pageId = pageObjectIds[index];
    if (pageId === undefined) {
      throw new Error("Missing PDF page");
    }
    const contentId = pageId + 1;
    const data = `${stream}\n`;
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${data.length} >>\nstream\n${data}endstream\nendobj\n`
    );
  }
  objects.push(
    `${fontRegularId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `${infoId} 0 obj\n<< /Title (${escapePdfText(title)}) /Author (Listwell) /Creator (Listwell) >>\nendobj\n`
  );

  const header = "%PDF-1.4\n";
  let cursor = header.length;
  const xref = ["0000000000 65535 f "];
  const body: string[] = [header];
  for (const object of objects) {
    xref.push(`${cursor.toString().padStart(10, "0")} 00000 n `);
    body.push(object);
    cursor += object.length;
  }
  const xrefOffset = cursor;
  body.push(
    `xref\n0 ${xref.length}\n${xref.join("\n")}\ntrailer\n<< /Size ${xref.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  return new TextEncoder().encode(body.join(""));
};

const slug = (businessName: string): string => {
  const value = normalize(businessName)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return value.length > 0 ? value : "report";
};

export const reportPdfFilename = (
  businessName: string,
  edition: ReportPdfEdition = "final"
): string => {
  const kind =
    edition === "preview" ? "visibility-preview" : "visibility-report";
  return `${slug(businessName)}-${kind}.pdf`;
};

export const buildReportPdf = (input: ReportPdfInput): Uint8Array => {
  const parsed = reportPdfInputSchema.parse(input);
  const edition = resolveEdition(parsed);
  const dateLabel = formatReportDate(reportDate(parsed.generatedAt));
  const label = editionLabel(edition);
  const name = parsed.businessName.trim();
  const title =
    name.length > 0 ? `${name} visibility report` : "Visibility report";
  const pages = paginateBlocks(documentBlocks(parsed, edition, dateLabel));
  return pdfBytes(
    pages.map((page, index) =>
      paintPage(page, index, pages.length, {
        businessName: name.length > 0 ? name : "Visibility report",
        label,
      })
    ),
    title
  );
};

export const downloadReportPdf = (
  bytes: Uint8Array,
  filename: string
): void => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const copy = new Uint8Array(buffer);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
