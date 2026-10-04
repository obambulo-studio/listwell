import { cn } from "@/lib/utils";

const sizeClasses = {
  md: "size-4 border-2",
  sm: "size-3 border-[1.5px]",
} as const;

export const LoadingSpinner = ({
  className,
  size = "md",
  tone = "default",
}: {
  className?: string;
  size?: keyof typeof sizeClasses;
  tone?: "default" | "muted";
}) => {
  const borderClass =
    tone === "muted"
      ? "border-line border-t-ink-3"
      : "border-line-strong border-t-ink";

  return (
    <span
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full",
        borderClass,
        sizeClasses[size],
        className
      )}
      aria-hidden
    />
  );
};
