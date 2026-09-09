"use client";

import { createShader, playSweep, accentChain, ACCENTS } from "glimm";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/* The built-in "prism" palette is only cyan→indigo→magenta, so a sweep
 * reads as blue/purple. Build a true full-spectrum rainbow instead. */
const RAINBOW = accentChain([
  ACCENTS.red,
  ACCENTS.orange,
  ACCENTS.yellow,
  ACCENTS.green,
  ACCENTS.cyan,
  ACCENTS.blue,
  ACCENTS.purple,
]);

/* ─────────────────────────────────────────────────────────
 * PROMPT BAR
 * A composer with real controls: attach, @ data sources,
 * / commands, a model picker, dictation, and send.
 * Type @ or / to open the menus; ↑↓ + Enter to pick.
 * Variants: Rounded (card radius) · Pill (full radius).
 * ───────────────────────────────────────────────────────── */

const Icon = ({
  children,
  size = 15,
  strokeWidth = 1.8,
}: {
  children: React.ReactNode;
  size?: number;
  strokeWidth?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const GLYPHS: Record<string, React.ReactNode> = {
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  clip: (
    <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  globe: (
    <g>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </g>
  ),
  layers: (
    <g>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </g>
  ),
};

/* real product marks, inline so the file stays self-contained */
const BRANDS: Record<string, React.ReactNode> = {
  figma: (
    <svg width="11" height="16" viewBox="0 0 38 57" aria-hidden="true">
      <path
        d="M9.5 57A9.5 9.5 0 0 0 19 47.5V38H9.5a9.5 9.5 0 0 0 0 19z"
        fill="#0ACF83"
      />
      <path
        d="M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z"
        fill="#A259FF"
      />
      <path
        d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z"
        fill="#F24E1E"
      />
      <path d="M19 0h9.5a9.5 9.5 0 1 1 0 19H19V0z" fill="#FF7262" />
      <path
        d="M38 28.5a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z"
        fill="#1ABCFE"
      />
    </svg>
  ),
  gmail: (
    <svg width="15" height="12" viewBox="0 0 256 193" aria-hidden="true">
      <path
        d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z"
        fill="#4285F4"
      />
      <path
        d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798v98.91Z"
        fill="#34A853"
      />
      <path
        d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504 58.182 93.14Z"
        fill="#EA4335"
      />
      <path
        d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z"
        fill="#FBBC04"
      />
      <path
        d="m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z"
        fill="#C5221F"
      />
    </svg>
  ),
  slack: (
    <svg width="15" height="15" viewBox="0 0 127 127" aria-hidden="true">
      <path
        d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z"
        fill="#E01E5A"
      />
      <path
        d="M47 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.7 39.7.8 47 .8c7.3 0 13.2 5.9 13.2 13.2v13.2H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.3.7 54.4.7 47.1c0-7.3 5.9-13.2 13.2-13.2H47z"
        fill="#36C5F0"
      />
      <path
        d="M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2v33.2z"
        fill="#2EB67D"
      />
      <path
        d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z"
        fill="#ECB22E"
      />
    </svg>
  ),
};

interface Source {
  key: string;
  name: string;
  desc: string;
  glyph?: string;
  brand?: string;
  attach?: boolean;
  connect?: boolean;
}

interface MenuRow {
  key: string;
  name: string;
  desc: string;
}

interface ModelOption {
  key: string;
  name: string;
  tag: string;
}

const SOURCES: Source[] = [
  {
    attach: true,
    desc: "Upload from your computer",
    glyph: "clip",
    key: "attach",
    name: "Add photos & files",
  },
  {
    desc: "Sales & churn metrics",
    glyph: "chart",
    key: "scoop",
    name: "Scoop Data",
  },
  {
    desc: "26 makers, tags, links",
    glyph: "layers",
    key: "flavors",
    name: "Flavor records",
  },
  {
    desc: "Real-time news and info",
    glyph: "globe",
    key: "web",
    name: "Web search",
  },
  {
    brand: "figma",
    desc: "Design-to-code workflows",
    key: "figma",
    name: "Figma",
  },
  {
    brand: "slack",
    desc: "Read and manage Slack",
    key: "slack",
    name: "Slack",
  },
  {
    brand: "gmail",
    connect: true,
    desc: "Read and manage Gmail",
    key: "gmail",
    name: "Gmail",
  },
];

const COMMANDS = [
  { desc: "Flavor vs. last summer", key: "compare", name: "/compare" },
  { desc: "Draft a churn schedule", key: "churn-plan", name: "/churn-plan" },
  { desc: "Build a reorder list", key: "restock", name: "/restock" },
  { desc: "Write a supplier email", key: "draft-email", name: "/draft-email" },
  { desc: "Digest the thread so far", key: "summarize", name: "/summarize" },
];

const MODELS = [
  { key: "sprinkles-5", name: "Sprinkles 5", tag: "Flagship" },
  { key: "vanilla-1", name: "Vanilla 1", tag: "Basic" },
  { key: "freezer-burn", name: "Freezer Burn 0.4", tag: "Stale" },
];

const FILES = ["flavor-chart.png", "summer-menu.pdf", "pos-export.csv"];
const DICTATION = "Compare pistachio weekends to last summer";

const TOKEN_PATTERN = /(?<prefix>^|\s)(?<trigger>[@/])(?<query>[\w-]*)$/u;

/* self-running demo: walk the @ menu, then the / menu, and repeat.
 * Any pointer or key interaction hands control to the user. */
const AUTO_STEPS: {
  draft: string;
  active?: number;
  connect?: boolean;
  modelOpen?: boolean;
  model?: string;
  hold: number;
}[] = [
  { connect: false, draft: "", hold: 1100, model: "vanilla-1" },
  { active: 0, draft: "@", hold: 900 },
  { active: 1, draft: "@", hold: 620 },
  { active: 4, draft: "@", hold: 620 },
  { active: 6, draft: "@", hold: 700 },
  { active: 6, connect: true, draft: "@", hold: 1000 },
  { draft: "", hold: 700 },
  { active: 0, draft: "/", hold: 900 },
  { active: 1, draft: "/", hold: 620 },
  { active: 3, draft: "/", hold: 1000 },
  { draft: "", hold: 800 },
  { draft: "", hold: 1200, modelOpen: true },
  { draft: "", hold: 2400, model: "sprinkles-5" },
  { draft: "", hold: 900 },
];

/* the last @word or /word being typed, if any */
const parseToken = (
  draft: string
): { kind: "at" | "slash"; query: string; start: number } | null => {
  const match = TOKEN_PATTERN.exec(draft);
  if (!match?.groups) {
    return null;
  }
  const { prefix, trigger, query } = match.groups;
  return {
    kind: trigger === "@" ? "at" : "slash",
    query: query.toLowerCase(),
    start: match.index + prefix.length,
  };
};

const getFilteredRows = (
  menu: "at" | "slash" | null,
  query: string
): MenuRow[] => {
  if (menu === "at") {
    return SOURCES.filter((source) =>
      source.name.toLowerCase().includes(query)
    );
  }
  if (menu === "slash") {
    return COMMANDS.filter((command) =>
      command.name.slice(1).startsWith(query)
    );
  }
  return [];
};

const getComposerRadius = (
  pill: boolean,
  tall: boolean,
  wide: boolean,
  hasAttachments: boolean
): string => {
  if (pill) {
    if (hasAttachments || wide) {
      return "rounded-[24px]";
    }
    return "rounded-full";
  }
  if (tall) {
    return "rounded-[22px]";
  }
  return "rounded-[14px]";
};

const createRainbowShader = (canvas: HTMLCanvasElement) => {
  const { random } = Math;
  Math.random = () => 0;
  try {
    return createShader({
      bandTight: 10,
      canvas,
      direction: "ltr",
      palette: RAINBOW,
      swellAmount: 0.85,
    });
  } finally {
    Math.random = random;
  }
};

const runSweep = async (
  shader: NonNullable<ReturnType<typeof createShader>>,
  sweepingRef: React.MutableRefObject<boolean>
) => {
  try {
    const sweep = playSweep(shader, {
      bandTight: 10,
      brightness: 1.4,
      direction: "ltr",
      easing: "easeOutExpo",
      outroMs: 80,
      palette: RAINBOW,
      peakAlpha: 1.3,
      sweepMs: 570,
      swellAmount: 1,
      waveSpeed: 1.8,
    });
    await sweep.done;
  } finally {
    sweepingRef.current = false;
  }
};

const SourceIcon = ({ source }: { source: Source }) => (
  <span className="text-ink-2 flex size-5.5 shrink-0 items-center justify-center">
    {source.brand ? (
      BRANDS[source.brand]
    ) : (
      <Icon size={15}>{GLYPHS[source.glyph ?? "clip"]}</Icon>
    )}
  </span>
);

const MenuRowItem = ({
  row,
  menu,
  connected,
  onPick,
  onToggleConnect,
  onHover,
  rowRef,
}: {
  row: MenuRow;
  menu: "at" | "slash";
  connected: boolean;
  onPick: (row: MenuRow) => void;
  onToggleConnect: () => void;
  onHover: () => void;
  rowRef: (element: HTMLButtonElement | null) => void;
}) => {
  const source =
    menu === "at" ? SOURCES.find((item) => item.key === row.key) : undefined;

  return (
    <div className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2">
      <button
        type="button"
        ref={rowRef}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={onHover}
        onClick={() => onPick(row)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {source && <SourceIcon source={source} />}
        <span className="text-ink shrink-0 text-[12.5px] font-medium">
          {row.name}
        </span>
        <span className="text-ink-3 min-w-0 flex-1 truncate text-[12px]">
          {row.desc}
        </span>
      </button>
      {source?.connect && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleConnect();
          }}
          className={`shrink-0 text-[12px] font-medium transition-colors duration-100 ${
            connected ? "text-green" : "text-accent-ink hover:underline"
          }`}
        >
          {connected ? "Connected" : "Connect"}
        </button>
      )}
    </div>
  );
};

export interface AtSlashMenuHandle {
  pickActive: (rows: MenuRow[], onPick: (row: MenuRow) => void) => void;
  reset: () => void;
  setActiveIndex: (index: number) => void;
  shiftActive: (direction: "up" | "down", rowCount: number) => void;
}

const AtSlashMenu = ({
  ref,
  menu,
  rows,
  query,
  connected,
  demoActive,
  onPick,
  onToggleConnect,
}: {
  ref?: React.Ref<AtSlashMenuHandle>;
  menu: "at" | "slash";
  rows: MenuRow[];
  query: string;
  connected: boolean;
  demoActive?: number;
  onPick: (row: MenuRow) => void;
  onToggleConnect: () => void;
}) => {
  const [internalActive, setInternalActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(
    null
  );
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = demoActive ?? internalActive;

  useImperativeHandle(
    ref,
    () => ({
      pickActive: (menuRows, onPickRow) => {
        const row = menuRows[active];
        if (row) {
          onPickRow(row);
        }
      },
      reset: () => {
        setInternalActive(0);
        setEngaged(false);
      },
      setActiveIndex: setInternalActive,
      shiftActive: (direction, rowCount) => {
        if (rowCount === 0) {
          return;
        }
        setEngaged(true);
        setInternalActive(
          (current) =>
            (current + (direction === "down" ? 1 : rowCount - 1)) % rowCount
        );
      },
    }),
    [active]
  );

  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) {
      setRowBox({ height: target.offsetHeight, top: target.offsetTop });
    }
  }, [active]);

  return (
    <div
      onMouseLeave={() => setEngaged(false)}
      className="bg-surface shadow-raised absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] p-1"
      style={{
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        transformOrigin: "bottom center",
      }}
    >
      <span
        aria-hidden
        className="bg-hover pointer-events-none absolute inset-x-1 rounded-[6px]"
        style={{
          height: rowBox?.height ?? 0,
          opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
          top: rowBox?.top ?? 0,
          transition:
            "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
        }}
      />
      {rows.map((row, index) => (
        <MenuRowItem
          key={row.key}
          row={row}
          menu={menu}
          connected={connected}
          onPick={onPick}
          onToggleConnect={onToggleConnect}
          onHover={() => {
            setInternalActive(index);
            setEngaged(true);
          }}
          rowRef={(element) => {
            rowRefs.current[index] = element;
          }}
        />
      ))}
      {rows.length === 0 && (
        <div className="text-ink-3 flex h-9 items-center px-2 text-[12px]">
          No matches for “{query}”
        </div>
      )}
      <div className="border-line text-ink-3 mt-1 border-t px-2 pt-1.5 pb-1 text-[11px]">
        {menu === "at"
          ? "Type to search sources & files"
          : "Type to search commands"}
      </div>
    </div>
  );
};

const ModelMenu = ({
  model,
  anchorRef,
  triggerRef,
  onSelectModel,
}: {
  model: ModelOption;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onSelectModel: (model: ModelOption) => void;
}) => {
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [modelBox, setModelBox] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelIndex = MODELS.findIndex((item) => item.key === model.key);

  useLayoutEffect(() => {
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target) {
      setModelBox({ height: target.offsetHeight, top: target.offsetTop });
    }
  }, [modelHovered, modelIndex]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const trigger = triggerRef.current;
    if (!anchor || !trigger) {
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    setModelMenuLeft(
      Math.max(
        0,
        Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 176)
      )
    );
    setModelMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [anchorRef, triggerRef]);

  return (
    <div
      onMouseLeave={() => setModelHovered(null)}
      className="bg-surface shadow-raised absolute z-10 w-44 rounded-[10px] p-1"
      style={{
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        bottom: modelMenuBottom,
        left: modelMenuLeft,
        transformOrigin: "bottom left",
      }}
    >
      <span
        aria-hidden
        className="bg-hover pointer-events-none absolute inset-x-1 rounded-[6px]"
        style={{
          height: modelBox?.height ?? 0,
          opacity: modelBox && modelHovered !== null ? 1 : 0,
          top: modelBox?.top ?? 0,
          transition:
            "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
        }}
      />
      {MODELS.map((option, index) => (
        <button
          key={option.key}
          type="button"
          ref={(element) => {
            modelRowRefs.current[index] = element;
          }}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setModelHovered(index)}
          onClick={() => onSelectModel(option)}
          className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left"
        >
          <span className="text-ink min-w-0 flex-1 truncate text-[12.5px] font-medium">
            {option.name}
          </span>
          <span className="text-ink-3 shrink-0 text-[11px]">{option.tag}</span>
          <span
            className={`text-ink shrink-0 ${option.key === model.key ? "" : "invisible"}`}
          >
            <Icon size={13} strokeWidth={2.5}>
              <path d="M20 6L9 17l-5-5" />
            </Icon>
          </span>
        </button>
      ))}
    </div>
  );
};

const AttachmentChips = ({
  attachments,
  pill,
  onRemove,
}: {
  attachments: string[];
  pill: boolean;
  onRemove: (index: number) => void;
}) => (
  <div className={`flex flex-wrap gap-1.5 pt-0.5 ${pill ? "px-1" : "px-0.5"}`}>
    {attachments.map((file, index) => (
      <span
        key={file}
        className={`bg-field text-ink-2 shadow-hairline flex h-6.5 items-center gap-1.5 py-1 pr-1 pl-1.5 text-[11.5px] ${
          pill ? "rounded-full" : "rounded-chip"
        }`}
        style={{
          animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
        }}
      >
        <Icon size={12}>
          <g>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </g>
        </Icon>
        <span className="max-w-36 truncate">{file}</span>
        <button
          type="button"
          aria-label={`Remove ${file}`}
          onClick={() => onRemove(index)}
          className={`text-ink-3 hover:bg-line/70 hover:text-ink -my-1 flex size-6 items-center justify-center transition-colors duration-100 ${
            pill ? "rounded-full" : "rounded-[5px]"
          }`}
        >
          <Icon size={10} strokeWidth={2.5}>
            <path d="M18 6L6 18M6 6l12 12" />
          </Icon>
        </button>
      </span>
    ))}
  </div>
);

const DictationIcon = ({ listening }: { listening: boolean }) => {
  if (listening) {
    return (
      <span className="flex h-3.5 items-center gap-[2.5px]">
        {[0, 1, 2].map((index) => (
          <span
            key={`eq-${String(index)}`}
            className="w-[2.5px] rounded-full bg-current"
            style={{
              animation: `eq-bounce 900ms ease-in-out ${index * 150}ms infinite`,
              height: "100%",
            }}
          />
        ))}
      </span>
    );
  }

  return (
    <Icon size={15} strokeWidth={2}>
      <g>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
      </g>
    </Icon>
  );
};

const handlePromptKeyDown = ({
  event,
  menu,
  rows,
  menuRef,
  pick,
  setDismissed,
  closeMenus,
  send,
}: {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  menu: "at" | "slash" | null;
  rows: MenuRow[];
  menuRef: React.RefObject<AtSlashMenuHandle | null>;
  pick: (row: MenuRow) => void;
  setDismissed: (value: boolean) => void;
  closeMenus: () => void;
  send: () => void;
}) => {
  if (menu && rows.length > 0) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      menuRef.current?.shiftActive(
        event.key === "ArrowDown" ? "down" : "up",
        rows.length
      );
      return;
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      menuRef.current?.pickActive(rows, pick);
      return;
    }
  }
  if (event.key === "Escape") {
    setDismissed(true);
    closeMenus();
    return;
  }
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    send();
  }
};

const useGlimmShader = (
  glimmRef: React.RefObject<HTMLCanvasElement | null>
) => {
  const shaderRef = useRef<ReturnType<typeof createShader> | null>(null);
  const sweepingRef = useRef(false);

  useEffect(() => {
    const canvas = glimmRef.current;
    if (!canvas) {
      return;
    }
    shaderRef.current = createRainbowShader(canvas);
    return () => {
      shaderRef.current?.destroy();
      shaderRef.current = null;
    };
  }, [glimmRef]);

  const celebrate = () => {
    if (sweepingRef.current) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    shaderRef.current?.destroy();
    const canvas = glimmRef.current;
    if (!canvas) {
      return;
    }
    const shader = createRainbowShader(canvas);
    shaderRef.current = shader;
    sweepingRef.current = true;
    void runSweep(shader, sweepingRef);
  };

  return celebrate;
};

const useAutoDemo = ({
  auto,
  autoStep,
  celebrate,
  menuRef,
  setAutoStep,
  setConnected,
  setDraft,
  setModel,
  setModelOpen,
}: {
  auto: boolean;
  autoStep: number;
  celebrate: () => void;
  menuRef: React.RefObject<AtSlashMenuHandle | null>;
  setAutoStep: React.Dispatch<React.SetStateAction<number>>;
  setConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setModel: React.Dispatch<React.SetStateAction<ModelOption>>;
  setModelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  useEffect(() => {
    if (!auto) {
      return;
    }
    const step = AUTO_STEPS[autoStep % AUTO_STEPS.length];
    const applyTimer = window.setTimeout(() => {
      setDraft(step.draft);
      if (step.active !== undefined) {
        menuRef.current?.setActiveIndex(step.active);
      }
      if (step.connect !== undefined) {
        setConnected(step.connect);
      }
      if (step.modelOpen !== undefined) {
        setModelOpen(step.modelOpen);
      }
      if (step.model) {
        const next = MODELS.find((item) => item.key === step.model);
        if (next) {
          setModel(next);
          setModelOpen(false);
          if (next.key === "sprinkles-5") {
            celebrate();
          }
        }
      }
    }, 0);
    const advanceTimer = window.setTimeout(
      () => setAutoStep((value) => value + 1),
      step.hold
    );
    return () => {
      window.clearTimeout(applyTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [
    auto,
    autoStep,
    celebrate,
    menuRef,
    setAutoStep,
    setConnected,
    setDraft,
    setModel,
    setModelOpen,
  ]);

  return AUTO_STEPS[autoStep % AUTO_STEPS.length];
};

const useDictation = (
  listening: boolean,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  setDraft: React.Dispatch<React.SetStateAction<string>>,
  setListening: React.Dispatch<React.SetStateAction<boolean>>
) => {
  useEffect(() => {
    if (!listening) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDraft((current) =>
        current ? `${current.trimEnd()} ${DICTATION}` : DICTATION
      );
      setListening(false);
      inputRef.current?.focus();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [inputRef, listening, setDraft, setListening]);
};

const useComposerLayout = ({
  draft,
  expanded,
  setExpanded,
  inputRef,
  controlsRef,
  measureRef,
  modelRef,
}: {
  draft: string;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  controlsRef: React.RefObject<HTMLDivElement | null>;
  measureRef: React.RefObject<HTMLSpanElement | null>;
  modelRef: React.RefObject<HTMLButtonElement | null>;
}) => {
  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = modelRef.current;
    if (!input || !controls || !measure || !modelButton) {
      return;
    }

    const fixedControlsWidth = 28 * 3 + modelButton.offsetWidth;
    const inlineGaps = 4 * 4;
    const inlineInputWidth =
      controls.clientWidth - fixedControlsWidth - inlineGaps;
    const needsFullWidth =
      draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) {
      setExpanded(needsFullWidth);
    }

    const minHeight = 28;
    const maxHeight = 100;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [
    controlsRef,
    draft,
    expanded,
    inputRef,
    measureRef,
    modelRef,
    setExpanded,
  ]);
};

const useCloseMenusOnOutside = (
  modelOpen: boolean,
  plusOpen: boolean,
  closeMenus: () => void
) => {
  useEffect(() => {
    if (!modelOpen && !plusOpen) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-promptbar]")) {
        closeMenus();
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [closeMenus, modelOpen, plusOpen]);
};

const buildPickDraft = ({
  row,
  menu,
  draft,
  token,
}: {
  row: MenuRow;
  menu: "at" | "slash" | null;
  draft: string;
  token: ReturnType<typeof parseToken>;
}) => {
  const source = SOURCES.find((item) => item.key === row.key);
  const prefix = token ? draft.slice(0, token.start) : draft;
  if (source?.attach) {
    return { attachments: true, draft: token ? prefix : draft };
  }
  if (menu === "at") {
    return { attachments: false, draft: `${prefix}@${row.name} ` };
  }
  return { attachments: false, draft: `${prefix}${row.name} ` };
};

const getControlLayout = (wide: boolean, pill: boolean, tall: boolean) => ({
  composerPadding: tall ? "gap-2.5 p-3.5" : "gap-1.5 p-1.5",
  controlGrid: wide
    ? "grid-cols-[28px_auto_minmax(0,1fr)_28px_28px]"
    : "grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]",
  dictationLayout: wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1",
  inputClass: tall
    ? "min-h-[68px] px-2 py-2 text-[14px] leading-5"
    : "min-h-7 px-1 py-[5px] text-[13px] leading-[18px]",
  inputLayout: wide
    ? "col-span-full col-start-1 row-start-1"
    : "col-start-2 row-start-1",
  modelLayout: wide
    ? "col-start-2 row-start-2 justify-self-start"
    : "col-start-3 row-start-1",
  plusLayout: wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1",
  roundControl: pill ? "rounded-full" : "rounded-[8px]",
  sendLayout: wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1",
});

const PromptComposer = ({
  attachments,
  canSend,
  composerRadius,
  controlsRef,
  draft,
  glimmRef,
  inputRef,
  listening,
  measureRef,
  menu,
  menuRef,
  model,
  modelOpen,
  modelRef,
  onDraftChange,
  onPick,
  onRemoveAttachment,
  onSend,
  onToggleDictation,
  onToggleModelMenu,
  onTogglePlusMenu,
  pill,
  placeholder,
  plusOpen,
  rows,
  send,
  setDismissed,
  tall,
  wide,
  closeMenus,
}: {
  attachments: string[];
  canSend: boolean;
  composerRadius: string;
  controlsRef: React.RefObject<HTMLDivElement | null>;
  draft: string;
  glimmRef: React.RefObject<HTMLCanvasElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  listening: boolean;
  measureRef: React.RefObject<HTMLSpanElement | null>;
  menu: "at" | "slash" | null;
  menuRef: React.RefObject<AtSlashMenuHandle | null>;
  model: ModelOption;
  modelOpen: boolean;
  modelRef: React.RefObject<HTMLButtonElement | null>;
  onDraftChange: (value: string) => void;
  onPick: (row: MenuRow) => void;
  onRemoveAttachment: (index: number) => void;
  onSend: () => void;
  onToggleDictation: () => void;
  onToggleModelMenu: () => void;
  onTogglePlusMenu: () => void;
  pill: boolean;
  placeholder?: string;
  plusOpen: boolean;
  rows: MenuRow[];
  send: () => void;
  setDismissed: (value: boolean) => void;
  tall: boolean;
  wide: boolean;
  closeMenus: () => void;
}) => {
  const layout = getControlLayout(wide, pill, tall);

  return (
    <div
      className={`border-line bg-surface shadow-card focus-within:border-line-strong relative isolate flex flex-col overflow-hidden border transition-[border-color,border-radius] duration-150 ${layout.composerPadding} ${composerRadius}`}
    >
      <canvas
        ref={glimmRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        style={{ borderRadius: "inherit" }}
      />
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute text-[13px] leading-[18px] whitespace-pre"
      >
        {draft}
      </span>

      {attachments.length > 0 && (
        <AttachmentChips
          attachments={attachments}
          pill={pill}
          onRemove={onRemoveAttachment}
        />
      )}

      <div
        ref={controlsRef}
        className={`grid items-end gap-x-1 gap-y-1.5 ${layout.controlGrid}`}
      >
        <button
          type="button"
          aria-label="Add attachments and sources"
          aria-expanded={plusOpen}
          onClick={onTogglePlusMenu}
          className={`text-ink-3 hover:bg-hover hover:text-ink flex size-7 shrink-0 items-center justify-center justify-self-start transition-[background-color,color,transform] duration-150 active:scale-[0.94] ${layout.roundControl} ${plusOpen ? "bg-hover text-ink" : ""} ${layout.plusLayout}`}
        >
          <Icon size={16} strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </Icon>
        </button>

        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) =>
            handlePromptKeyDown({
              closeMenus,
              event,
              menu,
              menuRef,
              pick: onPick,
              rows,
              send,
              setDismissed,
            })
          }
          placeholder={
            listening ? "Listening…" : (placeholder ?? "Write a message…")
          }
          aria-label="Prompt"
          className={`${layout.inputClass} text-ink placeholder:text-ink-3 w-full min-w-0 resize-none bg-transparent [overflow-wrap:anywhere] outline-none ${layout.inputLayout}`}
        />

        <button
          ref={modelRef}
          type="button"
          aria-expanded={modelOpen}
          aria-label="Choose model"
          onClick={onToggleModelMenu}
          className={`text-ink-2 hover:bg-hover hover:text-ink flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium transition-colors duration-150 ${layout.roundControl} ${layout.modelLayout}`}
        >
          {model.name}
          <span className="text-ink-3">
            <Icon size={11} strokeWidth={2.4}>
              <path d="M6 9l6 6 6-6" />
            </Icon>
          </span>
        </button>

        <button
          type="button"
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          aria-pressed={listening}
          onClick={onToggleDictation}
          className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.94] ${layout.roundControl} ${listening ? "bg-accent-tint text-accent-ink" : "text-ink-3 hover:bg-hover hover:text-ink"} ${layout.dictationLayout}`}
        >
          <DictationIcon listening={listening} />
        </button>

        <button
          type="button"
          aria-label="Send"
          disabled={!canSend}
          onClick={onSend}
          className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] ${layout.roundControl} ${layout.sendLayout}`}
          style={{
            background: canSend ? "var(--ink)" : "var(--line-strong)",
            color: canSend ? "var(--surface)" : "var(--ink-2)",
          }}
        >
          <Icon size={16} strokeWidth={2.4}>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </Icon>
        </button>
      </div>
    </div>
  );
};

const PromptBar = ({
  variant = "Rounded",
  demo = true,
  tall = false,
  placeholder,
  onSend,
}: {
  variant?: string;
  demo?: boolean;
  tall?: boolean;
  placeholder?: string;
  onSend?: (text: string) => void;
}) => {
  const pill = variant === "Pill";
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [model, setModel] = useState<ModelOption>(MODELS[1]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
  const [auto, setAuto] = useState(demo);
  const [autoStep, setAutoStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const wide = expanded || tall;
  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<AtSlashMenuHandle>(null);
  const glimmRef = useRef<HTMLCanvasElement>(null);

  const celebrate = useGlimmShader(glimmRef);
  const demoStep = useAutoDemo({
    auto,
    autoStep,
    celebrate,
    menuRef,
    setAutoStep,
    setConnected,
    setDraft,
    setModel,
    setModelOpen,
  });

  const takeOver = (event: { target: EventTarget | null }) => {
    setAuto(false);
    if (auto && event.target === inputRef.current) {
      setDraft("");
    }
  };

  const token = dismissed ? null : parseToken(draft);
  const menu: "at" | "slash" | null = plusOpen ? "at" : (token?.kind ?? null);
  const query = plusOpen ? "" : (token?.query ?? "");
  const rows = getFilteredRows(menu, query);
  const menuKey = `${menu ?? ""}:${query}`;

  useDictation(listening, inputRef, setDraft, setListening);
  useComposerLayout({
    controlsRef,
    draft,
    expanded,
    inputRef,
    measureRef,
    modelRef,
    setExpanded,
  });

  const closeMenus = () => {
    setPlusOpen(false);
    setModelOpen(false);
  };

  useCloseMenusOnOutside(modelOpen, plusOpen, closeMenus);

  const pick = (row: MenuRow) => {
    const result = buildPickDraft({ draft, menu, row, token });
    if (result.attachments) {
      setAttachments((current) => [
        ...current,
        FILES[current.length % FILES.length],
      ]);
    }
    setDraft(result.draft);
    setPlusOpen(false);
    setDismissed(false);
    menuRef.current?.reset();
    inputRef.current?.focus();
  };

  const canSend = draft.trim().length > 0 || attachments.length > 0;
  const send = () => {
    if (!canSend) {
      return;
    }
    onSend?.(draft.trim());
    setDraft("");
    setAttachments([]);
    closeMenus();
  };

  const selectModel = (next: ModelOption) => {
    setModel(next);
    setModelOpen(false);
    if (next.key === "sprinkles-5") {
      celebrate();
    }
  };

  const resetMenuOnDraftChange = (nextDraft: string) => {
    const nextToken = dismissed ? null : parseToken(nextDraft);
    const nextKey = `${plusOpen ? "at" : (nextToken?.kind ?? "")}:${plusOpen ? "" : (nextToken?.query ?? "")}`;
    if (nextKey !== menuKey) {
      menuRef.current?.reset();
    }
    setDraft(nextDraft);
    setDismissed(false);
    setPlusOpen(false);
  };

  const wrapperClass = demo
    ? "flex min-h-[384px] w-full max-w-105 flex-col justify-end pb-8"
    : "w-full";
  const composerRadius = getComposerRadius(
    pill,
    tall,
    wide,
    attachments.length > 0
  );

  return (
    <div
      data-promptbar
      className={wrapperClass}
      onPointerDownCapture={takeOver}
      onKeyDownCapture={takeOver}
    >
      <div ref={composerAnchorRef} className="relative">
        {menu && (
          <AtSlashMenu
            key={menuKey}
            ref={menuRef}
            menu={menu}
            rows={rows}
            query={query}
            connected={connected}
            demoActive={auto ? demoStep.active : undefined}
            onPick={pick}
            onToggleConnect={() => setConnected((current) => !current)}
          />
        )}

        {modelOpen && (
          <ModelMenu
            model={model}
            anchorRef={composerAnchorRef}
            triggerRef={modelRef}
            onSelectModel={(next) => {
              selectModel(next);
              inputRef.current?.focus();
            }}
          />
        )}

        <PromptComposer
          attachments={attachments}
          canSend={canSend}
          closeMenus={closeMenus}
          composerRadius={composerRadius}
          controlsRef={controlsRef}
          draft={draft}
          glimmRef={glimmRef}
          inputRef={inputRef}
          listening={listening}
          measureRef={measureRef}
          menu={menu}
          menuRef={menuRef}
          model={model}
          modelOpen={modelOpen}
          modelRef={modelRef}
          onDraftChange={resetMenuOnDraftChange}
          onPick={pick}
          onRemoveAttachment={(index) =>
            setAttachments((current) =>
              current.filter((_, itemIndex) => itemIndex !== index)
            )
          }
          onSend={send}
          onToggleDictation={() => setListening((current) => !current)}
          onToggleModelMenu={() => {
            setPlusOpen(false);
            setModelOpen((current) => !current);
          }}
          onTogglePlusMenu={() => {
            setModelOpen(false);
            menuRef.current?.reset();
            setPlusOpen((current) => !current);
            inputRef.current?.focus();
          }}
          pill={pill}
          placeholder={placeholder}
          plusOpen={plusOpen}
          rows={rows}
          send={send}
          setDismissed={setDismissed}
          tall={tall}
          wide={wide}
        />
      </div>
    </div>
  );
};

export default PromptBar;
