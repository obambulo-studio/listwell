"use client";

import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const filledShadow = "shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]";

/* Pill-shaped by default — the app's core button style. Explicit symmetric
 * padding (not a fixed height) so the top/bottom spacing is always equal. */
export const buttonVariants = cva(
  `inline-flex items-center justify-center font-medium transition-[transform,background-color,opacity] duration-150 ease-out select-none active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50`,
  {
    defaultVariants: { size: "md", variant: "secondary" },
    variants: {
      size: {
        md: "gap-2 rounded-full px-4 py-[9px] text-sm leading-none",
        sm: "h-[27px] gap-1.5 rounded-full px-3 text-[13px] leading-none",
        xs: "h-7 gap-1 rounded-full px-2.5 text-[12px] leading-none font-normal",
      },
      variant: {
        accent: `bg-accent hover:bg-accent-ink text-white ${filledShadow}`,
        ghost: "bg-hover-2 text-ink hover:bg-line-strong",
        primary: `bg-ink text-canvas dark:bg-ink dark:text-canvas hover:opacity-90 ${filledShadow}`,
        quiet: "text-ink hover:bg-hover",
        secondary:
          "bg-surface text-ink shadow-btn hover:bg-inset aria-expanded:bg-hover",
        success: `bg-green text-white hover:brightness-95 ${filledShadow}`,
      },
    },
  }
);

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

export const Button = ({
  variant,
  size,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> &
  VariantProps<typeof buttonVariants>) => (
  <button
    type="button"
    className={cn(buttonVariants({ size, variant }), className)}
    {...props}
  />
);
