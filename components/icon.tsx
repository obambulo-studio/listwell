import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

type IconProps = ComponentProps<typeof HugeiconsIcon>;

/** Stroke icon at the interface weight. */
export const Icon = ({
  color = "currentColor",
  size = 16,
  strokeWidth = 1.75,
  ...props
}: IconProps) => (
  <HugeiconsIcon
    color={color}
    size={size}
    strokeWidth={strokeWidth}
    {...props}
    aria-hidden
  />
);
