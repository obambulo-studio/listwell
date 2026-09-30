const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const BOTTOM = 56;
const BODY_SIZE = 11;
const BODY_LEADING = 16;
const TITLE_SIZE = 18;
const TITLE_LEADING = 24;
const LINE_WIDTH = 86;

export interface ReportPdfCheck {
  category: string;
  status: string;
  title: string;
}

export interface ReportPdfActionSection {
  actions: string[];
  title: string;
}

export interface ReportPdfInput {
  businessName: string;
  checks: ReportPdfCheck[];
  needsWork: number;
  nextActionSections?: ReportPdfActionSection[];
  nextActions: string[];
  overview: string[];
  passing: number;
  score: number;
  skipped: number;
}

interface PdfLine {
  leading: number;
  size: number;
  text: string;
}

const sanitize = (value: string): string =>
  value
    .replaceAll("≥", ">=")
    .replaceAll("≤", "<=")
    .replaceAll("·", " | ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll(/[^\n\u0020-\u007E]/gu, "");

const escapePdfText = (value: string): string =>
  sanitize(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");

const wrapLine = (value: string): string[] => {
  const words = sanitize(value)
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return [];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > LINE_WIDTH && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
};

const pushWrapped = (
  lines: PdfLine[],
  text: string,
  size: number,
  leading: number
): void => {
  for (const line of wrapLine(text)) {
    lines.push({ leading, size, text: line });
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

const reportLines = (input: ReportPdfInput): PdfLine[] => {
  const lines: PdfLine[] = [
    { leading: TITLE_LEADING, size: TITLE_SIZE, text: "Visibility report" },
    {
      leading: TITLE_LEADING,
      size: TITLE_SIZE,
      text: sanitize(input.businessName),
    },
    {
      leading: BODY_LEADING,
      size: BODY_SIZE,
      text: `${input.score}% visibility`,
    },
    {
      leading: BODY_LEADING,
      size: BODY_SIZE,
      text: `${input.passing} passing, ${input.needsWork} need work, ${input.skipped} skipped`,
    },
  ];

  if (input.overview.length > 0) {
    lines.push({
      leading: 22,
      size: BODY_SIZE,
      text: "What the checks found",
    });
    for (const claim of input.overview) {
      pushWrapped(lines, claim, BODY_SIZE, BODY_LEADING);
    }
  }

  const sections = nextActionSections(input);
  if (sections.length > 0) {
    lines.push({ leading: 22, size: BODY_SIZE, text: "What to do next" });
    let rank = 1;
    for (const section of sections) {
      if (section.title.length > 0) {
        lines.push({ leading: 20, size: BODY_SIZE, text: section.title });
      }
      for (const action of section.actions) {
        pushWrapped(lines, `${rank}. ${action}`, BODY_SIZE, BODY_LEADING);
        rank += 1;
      }
    }
  }

  if (input.checks.length > 0) {
    lines.push({ leading: 22, size: BODY_SIZE, text: "Checks" });
    let category = "";
    for (const check of input.checks) {
      const { category: checkCategory, status, title } = check;
      if (checkCategory !== category) {
        category = checkCategory;
        lines.push({
          leading: 20,
          size: BODY_SIZE,
          text: sanitize(checkCategory),
        });
      }
      pushWrapped(lines, `${status}: ${title}`, BODY_SIZE, BODY_LEADING);
    }
  }

  return lines;
};

const paginate = (lines: PdfLine[]): PdfLine[][] => {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    if (y - line.leading < BOTTOM && page.length > 0) {
      pages.push(page);
      page = [];
      y = PAGE_HEIGHT - MARGIN;
    }
    page.push(line);
    y -= line.leading;
  }
  if (page.length > 0) {
    pages.push(page);
  }
  return pages.length > 0
    ? pages
    : [[{ leading: BODY_LEADING, size: BODY_SIZE, text: "Visibility report" }]];
};

const pageStream = (lines: PdfLine[]): string => {
  const commands = ["BT"];
  let y = PAGE_HEIGHT - MARGIN;
  let size = 0;
  for (const line of lines) {
    const { leading, size: lineSize, text } = line;
    y -= leading;
    if (lineSize !== size) {
      commands.push(`/F1 ${lineSize} Tf`);
      size = lineSize;
    }
    commands.push(
      `1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm`,
      `(${escapePdfText(text)}) Tj`
    );
  }
  commands.push("ET");
  return commands.join("\n");
};

const pdfBytes = (streams: string[]): Uint8Array => {
  const fontId = 3 + streams.length * 2;
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
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${data.length} >>\nstream\n${data}endstream\nendobj\n`
    );
  }
  objects.push(
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
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
    `xref\n0 ${xref.length}\n${xref.join("\n")}\ntrailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  return new TextEncoder().encode(body.join(""));
};

export const reportPdfFilename = (businessName: string): string => {
  const slug = sanitize(businessName)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return `${slug.length > 0 ? slug : "report"}-visibility-report.pdf`;
};

export const buildReportPdf = (input: ReportPdfInput): Uint8Array =>
  pdfBytes(paginate(reportLines(input)).map((page) => pageStream(page)));

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
