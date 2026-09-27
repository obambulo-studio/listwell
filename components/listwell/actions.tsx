"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button, ButtonLink } from "@/components/atoms/button";
import { cn } from "@/lib/utils";

export const FormActions = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-wrap items-center gap-3 pt-1", className)}>
    {children}
  </div>
);

export const PrimaryButton = ({
  children,
  className,
  ...props
}: ComponentProps<typeof Button>) => (
  <Button variant="primary" size="md" className={className} {...props}>
    {children}
  </Button>
);

export const QuietButton = ({
  children,
  className,
  ...props
}: ComponentProps<typeof Button>) => (
  <Button variant="quiet" size="md" className={className} {...props}>
    {children}
  </Button>
);

export const QuietLink = ({
  children,
  className,
  href,
  ...props
}: ComponentProps<typeof ButtonLink>) => (
  <ButtonLink
    href={href}
    variant="quiet"
    size="md"
    className={className}
    {...props}
  >
    {children}
  </ButtonLink>
);
