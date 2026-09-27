import { Badge } from "@/components/ui/badge";
import type { CheckStatus } from "@/lib/chat-onboarding";
import { cn } from "@/lib/utils";

const statusLabel = (status: CheckStatus): string => {
  switch (status) {
    case "pass": {
      return "Pass";
    }
    case "fail": {
      return "Fail";
    }
    case "error": {
      return "Error";
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

const badgeToneClass = (status: CheckStatus): string | undefined => {
  if (status === "pass") {
    return "border-success/40 text-success-foreground bg-success/10";
  }
  if (status === "fail") {
    return "border-destructive/40 text-destructive bg-destructive/10";
  }
  if (status === "error") {
    return "border-warning/40 text-warning-foreground bg-warning/10";
  }
  return undefined;
};

export const CheckStatusBadge = ({
  status,
  className,
}: {
  status: CheckStatus;
  className?: string;
}) => {
  const label = statusLabel(status);

  return (
    <Badge variant="outline" className={cn(badgeToneClass(status), className)}>
      <span className="sr-only">Status: </span>
      {label}
    </Badge>
  );
};
