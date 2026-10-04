import Link from "next/link";

import { LISTWELL_CHAT_PATH } from "@/lib/listwell-routes";

export const SampleReportNotice = () => (
  <div className="listwell-page listwell-report">
    <div className="listwell-report__layout">
      <output className="listwell-notice">
        <p className="m-0">
          Sample report for Sample Cafe, a fictional Sydney cafe.{" "}
          <Link href={LISTWELL_CHAT_PATH}>Check your business</Link> to get your
          own free report.
        </p>
      </output>
    </div>
  </div>
);
