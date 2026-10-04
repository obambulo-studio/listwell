"use client";

import { ArrowUp01Icon } from "@hugeicons/core-free-icons";
import type { ComponentProps, ReactNode } from "react";

import { Button, ButtonLink } from "@/components/atoms/button";
import { Icon } from "@/components/icon";
import { ButtonBusyLabel } from "@/components/listwell/button-busy-label";
import { LoadingSpinner } from "@/components/listwell/loading-spinner";
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
  disabled,
  loading,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean }) => (
  <Button
    variant="primary"
    size="md"
    className={className}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...props}
  >
    <ButtonBusyLabel busy={loading}>{children}</ButtonBusyLabel>
  </Button>
);

export const QuietButton = ({
  children,
  className,
  disabled,
  loading,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean }) => (
  <Button
    variant="quiet"
    size="md"
    className={className}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...props}
  >
    <ButtonBusyLabel busy={loading}>{children}</ButtonBusyLabel>
  </Button>
);

/** Round arrow submit used inside chat-style composers. */
export const ComposerSubmit = ({
  label,
  disabled,
  loading,
}: {
  label: string;
  disabled?: boolean;
  loading?: boolean;
}) => (
  <Button
    type="submit"
    variant="primary"
    size="sm"
    className="listwell-chat__send shrink-0 rounded-full px-3"
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    aria-label={label}
  >
    {loading ? (
      <LoadingSpinner size="sm" />
    ) : (
      <Icon icon={ArrowUp01Icon} size={14} />
    )}
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
