"use client";

import type { ReactNode } from "react";

export const Monogram = ({
  children,
  color = "#e08a3c",
  className = "",
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) => (
  <span
    className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-semibold text-white ${className}`}
    style={{ background: color }}
  >
    {children}
  </span>
);

/** Inline entity reference — a monogram + name in a soft field pill.
 *  Names a supplier, person, or record inside running text. Softer than a
 *  StatusPill (no dot, no state) and not a mono token (see Chip). */
export const EntityChip = ({
  name,
  color,
  monogram,
  className = "",
}: {
  name: string;
  color?: string;
  monogram?: ReactNode;
  className?: string;
}) => (
  <span
    className={`bg-field shadow-hairline mx-0.5 inline-flex items-center gap-1 rounded-full py-px pr-1.5 pl-[3px] align-middle ${className}`}
  >
    <Monogram color={color}>{monogram ?? name.charAt(0)}</Monogram>
    <span className="text-ink text-[12px] font-medium">{name}</span>
  </span>
);
