import { parseHTML } from 'linkedom/worker'

export interface HtmlElement {
  textContent: string | null
  innerHTML: string
  getAttribute: (name: string) => string | null
  closest: (selector: string) => HtmlElement | null
  parentElement: HtmlElement | null
  nextElementSibling: HtmlElement | null
  children: HtmlElement[]
  remove: () => void
}

export interface HtmlDocument {
  querySelector: (selector: string) => HtmlElement | null
  querySelectorAll: (selector: string) => HtmlElement[]
  body: HtmlElement | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function listNodes(value: unknown): unknown[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (isRecord(value) && typeof value.length === 'number') {
    const length = value.length
    const nodes: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      nodes.push(value[index])
    }
    return nodes
  }
  return []
}

function wrapElement(value: unknown): HtmlElement | null {
  if (!isRecord(value) || typeof value.getAttribute !== 'function') return null

  return {
    get textContent() {
      return readString(value.textContent)
    },
    get innerHTML() {
      return readString(value.innerHTML) ?? ''
    },
    getAttribute: (name: string) => {
      if (typeof value.getAttribute !== 'function') return null
      return readString(value.getAttribute(name))
    },
    closest: (selector: string) => {
      if (typeof value.closest !== 'function') return null
      return wrapElement(value.closest(selector))
    },
    get parentElement() {
      return wrapElement(value.parentElement)
    },
    get nextElementSibling() {
      return wrapElement(value.nextElementSibling)
    },
    get children() {
      return listNodes(value.children)
        .map((child) => wrapElement(child))
        .filter((child): child is HtmlElement => child !== null)
    },
    remove: () => {
      if (typeof value.remove === 'function') value.remove()
    },
  }
}

export function parseDocument(html: string): HtmlDocument {
  const { document } = parseHTML(html)

  return {
    querySelector: (selector: string) => wrapElement(document.querySelector(selector)),
    querySelectorAll: (selector: string) =>
      listNodes(document.querySelectorAll(selector))
        .map((node) => wrapElement(node))
        .filter((node): node is HtmlElement => node !== null),
    body: wrapElement(document.body),
  }
}

export function parseJsonLd(document: HtmlDocument): unknown[] {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  const blocks: unknown[] = []

  for (const script of scripts) {
    const raw = script.textContent ?? script.innerHTML
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      // Ignore malformed JSON-LD blocks, matching upstream behaviour.
    }
  }

  return blocks
}

export function looksLikeThinSpa(html: string): boolean {
  const trimmed = html.trim()
  if (trimmed.length < 800) return true
  const textish = trimmed.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  const text = textish.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length < 200
}
