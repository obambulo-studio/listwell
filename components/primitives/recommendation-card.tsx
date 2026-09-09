"use client";

import { useState } from "react";

import { Button } from "@/components/atoms/button";
import type { ButtonVariant } from "@/components/atoms/button";
import { EntityChip } from "@/components/atoms/entity-chip";
import { ValuePill } from "@/components/atoms/value-pill";

/* ─────────────────────────────────────────────────────────
 * RECOMMENDATION CARD
 * The card holds its shape. Pressing "Alternatives" opens a
 * new drawer listing the other options; picking one promotes
 * it to the recommendation. The primary action confirms.
 * ───────────────────────────────────────────────────────── */

export interface RecommendationOption {
  key: string;
  body: React.ReactNode;
  short: string;
  signal: number;
  tone: string;
  label: string;
  cta: string;
  ctaVariant: ButtonVariant;
}

export interface RecommendationLabels {
  title: string;
  alternatives: string;
  otherOptions: string;
  accepted: string;
}

const DEFAULT_LABELS: RecommendationLabels = {
  accepted: "Accepted",
  alternatives: "Alternatives",
  otherOptions: "Other options",
  title: "Want me to place this restock order?",
};

const OPTIONS: RecommendationOption[] = [
  {
    body: (
      <>
        Reorder waffle cones from <EntityChip name="Cone King" /> with lead time{" "}
        <ValuePill tone="green">7 days</ValuePill>
      </>
    ),
    cta: "Accept",
    ctaVariant: "accent",
    key: "high",
    label: "High confidence",
    short: "Reorder from Cone King · 7-day lead",
    signal: 3,
    tone: "var(--green)",
  },
  {
    body: (
      <>
        Switch vanilla to <ValuePill>Vanilla Madagascar</ValuePill> for peak
        season.
      </>
    ),
    cta: "Configure",
    ctaVariant: "primary",
    key: "review",
    label: "Needs review",
    short: "Switch to Vanilla Madagascar",
    signal: 2,
    tone: "var(--orange)",
  },
  {
    body: (
      <>
        Fall back to a{" "}
        <span className="text-ink font-medium">full restock</span> across every
        SKU.
      </>
    ),
    cta: "Accept full restock",
    ctaVariant: "primary",
    key: "none",
    label: "No signal",
    short: "Full restock across every SKU",
    signal: 0,
    tone: "var(--ink-3)",
  },
];

const Meter = ({ signal, tone }: { signal: number; tone: string }) => (
  <span className="flex items-end gap-0.5">
    {[0, 1, 2].map((bar) => (
      <span
        key={bar}
        className="w-1 rounded-full transition-colors duration-300"
        style={{
          background: bar < signal ? tone : "var(--line-strong)",
          height: 10,
        }}
      />
    ))}
  </span>
);

const RecommendationCard = ({
  options = OPTIONS,
  labels,
}: {
  options?: RecommendationOption[];
  labels?: Partial<RecommendationLabels>;
  variant?: string;
} = {}) => {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const active = options[selected];
  const others = options.flatMap((o, i) => (i === selected ? [] : [{ i, o }]));

  return (
    <div className="rounded-card bg-surface shadow-card w-full max-w-95 overflow-hidden">
      <div className="primitive-card-pad">
        <span className="text-ink text-[14px] font-medium">{t.title}</span>
        <p
          key={active.key}
          className="text-ink-2 mt-1.5 min-h-12 text-[13px] leading-relaxed"
          style={{ animation: "fade-in 180ms ease-out both" }}
        >
          {active.body}
        </p>
      </div>

      {/* alternatives drawer — a distinctly new section of the card */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="border-line bg-surface border-t p-2">
            <p className="text-ink-3 px-1.5 pb-1 text-[11px] font-medium">
              {t.otherOptions}
            </p>
            {others.map(({ o, i }) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setSelected(i);
                  setAccepted(false);
                }}
                className="rounded-control hover:bg-hover flex w-full items-center gap-2.5 p-1.5 text-left transition-colors duration-100"
              >
                <Meter signal={o.signal} tone={o.tone} />
                <span className="text-ink min-w-0 flex-1 truncate text-[12.5px]">
                  {o.short}
                </span>
                <span className="text-ink-3 shrink-0 text-[11px]">
                  {o.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="primitive-card-footer bg-surface flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-ink-2 text-[12.5px] font-medium">
            {active.label}
          </span>
        </span>

        <span className="-mr-0.5 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="px-2.5 text-[12.5px]"
          >
            {t.alternatives}
          </Button>
          <Button
            variant={accepted ? "success" : active.ctaVariant}
            size="sm"
            onClick={() => setAccepted(true)}
            className="text-[12.5px]"
          >
            {accepted ? t.accepted : active.cta}
          </Button>
        </span>
      </div>
    </div>
  );
};

export default RecommendationCard;
