"use client";

import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { Icon } from "@/components/icon";

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    icons={{
      success: <Icon icon={CheckmarkCircle02Icon} size={16} />,
      info: <Icon icon={InformationCircleIcon} size={16} />,
      warning: <Icon icon={Alert02Icon} size={16} />,
      error: <Icon icon={CancelCircleIcon} size={16} />,
      loading: <Icon className="animate-spin" icon={Loading03Icon} size={16} />,
    }}
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties
    }
    toastOptions={{
      classNames: {
        toast: "cn-toast",
      },
    }}
    {...props}
  />
);

export { Toaster };
