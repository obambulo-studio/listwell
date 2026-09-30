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

const markPath = (status: CheckStatus): string | null => {
  if (status === "pass") {
    return "M20 6L9 17l-5-5";
  }
  if (status === "fail") {
    return "M18 6L6 18M6 6l12 12";
  }
  if (status === "error") {
    return "M5 12h14";
  }
  return null;
};

/** Round status mark matching the chat task rows. */
export const CheckStatusMark = ({ status }: { status: CheckStatus }) => {
  const path = markPath(status);
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full ${markToneClass(status)}`}
    >
      <span className="sr-only">{checkStatusText(status)}</span>
      {path ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={path} />
        </svg>
      ) : (
        <span
          className="border-line border-t-ink-3 size-4 animate-spin rounded-full border-2"
          aria-hidden
        />
      )}
    </span>
  );
};
