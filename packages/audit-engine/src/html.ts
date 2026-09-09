import { parseHTML } from "linkedom/worker";

export interface HtmlElement {
  textContent: string | null;
  innerHTML: string;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => HtmlElement | null;
  parentElement: HtmlElement | null;
  nextElementSibling: HtmlElement | null;
  children: HtmlElement[];
  remove: () => void;
}

export interface HtmlDocument {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => HtmlElement[];
  body: HtmlElement | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const listNodes = (value: unknown): unknown[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && typeof value.length === "number") {
    const { length } = value;
    const nodes: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      nodes.push(value[index]);
    }
    return nodes;
  }
  return [];
};

const wrapElement = (value: unknown): HtmlElement | null => {
  if (!isRecord(value) || typeof value.getAttribute !== "function") {
    return null;
  }

  return {
    get children() {
      const elements: HtmlElement[] = [];
      for (const child of listNodes(value.children)) {
        const wrapped = wrapElement(child);
        if (wrapped) {
          elements.push(wrapped);
        }
      }
      return elements;
    },
    closest: (selector: string) => {
      if (typeof value.closest !== "function") {
        return null;
      }
      return wrapElement(value.closest(selector));
    },
    getAttribute: (name: string) => {
      if (typeof value.getAttribute !== "function") {
        return null;
      }
      return readString(value.getAttribute(name));
    },
    get innerHTML() {
      return readString(value.innerHTML) ?? "";
    },
    get nextElementSibling() {
      return wrapElement(value.nextElementSibling);
    },
    get parentElement() {
      return wrapElement(value.parentElement);
    },
    remove: () => {
      if (typeof value.remove === "function") {
        value.remove();
      }
    },
    get textContent() {
      return readString(value.textContent);
    },
  };
};

export const parseDocument = (html: string): HtmlDocument => {
  const { document } = parseHTML(html);

  return {
    body: wrapElement(document.body),
    querySelector: (selector: string) =>
      wrapElement(document.querySelector(selector)),
    querySelectorAll: (selector: string) => {
      const elements: HtmlElement[] = [];
      for (const node of listNodes(document.querySelectorAll(selector))) {
        const wrapped = wrapElement(node);
        if (wrapped) {
          elements.push(wrapped);
        }
      }
      return elements;
    },
  };
};

export const parseJsonLd = (document: HtmlDocument): unknown[] => {
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  const blocks: unknown[] = [];

  for (const script of scripts) {
    const raw = script.textContent ?? script.innerHTML;
    if (!raw) {
      continue;
    }
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks, matching upstream behaviour.
    }
  }

  return blocks;
};

export const looksLikeThinSpa = (html: string): boolean => {
  const trimmed = html.trim();
  if (trimmed.length < 800) {
    return true;
  }
  const textish = trimmed
    .replaceAll(/<script[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<style[\s\S]*?<\/style>/giu, "");
  const text = textish
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return text.length < 200;
};
