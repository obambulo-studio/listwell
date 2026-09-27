import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { devUiFixtureEnabled } from "@/lib/dev-ui-fixture";

const DevUiFixtureLayout = ({ children }: { children: ReactNode }) => {
  if (!devUiFixtureEnabled()) {
    notFound();
  }
  return children;
};

export default DevUiFixtureLayout;
