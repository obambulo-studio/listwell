import {
  MinusSignIcon,
  MultiplicationSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { Icon } from "@/components/icon";
import { LoadingSpinner } from "@/components/listwell/loading-spinner";
import type { CheckStatus } from "@/lib/chat-onboarding";

export const checkStatusText = (status: CheckStatus): string => {
  switch (status) {
    case "pass": {
      return "Pass";
    }
    case "fail": {
      return "Needs work";
    }
    case "error": {
      return "Could not run";
    }
    case "queued":
    case "pending": {
      return "Waiting";
    }
    default: {
      return "Idle";
    }
  }
};

const markToneClass = (status: CheckStatus): string => {
  if (status === "pass") {
    return "bg-green text-white";
  }
  if (status === "fail") {
    return "bg-red text-white";
  }
  if (status === "error") {
    return "bg-ink-3 text-white";
  }
  return "text-ink-3";
};

const markIcon = (status: CheckStatus): IconSvgElement | null => {
  if (status === "pass") {
    return Tick02Icon;
  }
  if (status === "fail") {
    return MultiplicationSignIcon;
  }
  if (status === "error") {
    return MinusSignIcon;
  }
  return null;
};

/** Round status mark matching the chat task rows. */
export const CheckStatusMark = ({ status }: { status: CheckStatus }) => {
  const icon = markIcon(status);
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full ${markToneClass(status)}`}
    >
      <span className="sr-only">{checkStatusText(status)}</span>
      {icon ? (
        <Icon absoluteStrokeWidth icon={icon} size={12} strokeWidth={1.6} />
      ) : (
        <LoadingSpinner size="md" tone="muted" />
      )}
    </span>
  );
};
