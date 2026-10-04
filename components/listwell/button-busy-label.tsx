import type { ReactNode } from "react";

import { LoadingSpinner } from "@/components/listwell/loading-spinner";

export const ButtonBusyLabel = ({
  busy,
  children,
  spinnerSize = "sm",
}: {
  busy?: boolean;
  children: ReactNode;
  spinnerSize?: "sm" | "md";
}) => {
  if (!busy) {
    return children;
  }

  return (
    <>
      <LoadingSpinner size={spinnerSize} />
      {children}
    </>
  );
};
