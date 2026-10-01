"use client";

import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

/** Report chart frame. Colours come from the report theme tokens. */
export const ChartContainer = ({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}) => (
  <div aria-label={label} className="listwell-chart h-64 w-full" role="img">
    <ResponsiveContainer height="100%" width="100%">
      {children}
    </ResponsiveContainer>
  </div>
);
