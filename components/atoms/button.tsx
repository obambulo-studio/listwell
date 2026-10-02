"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { Button as UiButton, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UiVariant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];

const variantMap = {
  accent: "default",
  ghost: "ghost",
  primary: "default",
  quiet: "link",
  secondary: "secondary",
  success: "default",
} as const satisfies Record<string, UiVariant>;

export type ButtonVariant = keyof typeof variantMap;

interface SharedProps {
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md";
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
}

const sizeMap = {
  md: "default",
  sm: "sm",
  xs: "xs",
} as const;

const variantClassName = (variant: ButtonVariant): string | undefined => {
  if (variant === "accent" || variant === "primary") {
    return "bg-accent text-accent-foreground hover:bg-accent-ink";
  }
  if (variant === "success") {
    return "bg-green text-white hover:brightness-95";
  }
  return undefined;
};

export const Button = ({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: SharedProps & Omit<ComponentProps<typeof UiButton>, keyof SharedProps>) => (
  <UiButton
    variant={variantMap[variant]}
    size={sizeMap[size]}
    className={cn(variantClassName(variant), className)}
    {...props}
  />
);

export const ButtonLink = ({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: SharedProps & {
  href: ComponentProps<typeof Link>["href"];
} & Omit<ComponentProps<typeof Link>, keyof SharedProps | "href">) => (
  <Link
    href={href}
    className={cn(
      buttonVariants({ size: sizeMap[size], variant: variantMap[variant] }),
      variant === "quiet" && "px-0",
      variantClassName(variant),
      className
    )}
    {...props}
  >
    {children}
  </Link>
);
