import Link from "next/link";

import { getSessionUser, listReportsForUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your businesses",
};

const ACCOUNT_DATE_FORMAT = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
});

const formatPlan = (plan: "preview" | "once" | "monthly"): string => {
  if (plan === "monthly") {
    return "Monthly scans";
  }
  if (plan === "once") {
    return "Full report";
  }
  return "Preview";
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) {
    return "—";
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "—";
  }
  return ACCOUNT_DATE_FORMAT.format(parsed);
};

const AccountPage = async () => {
  const user = await getSessionUser();
  if (!user) {
    return (
      <section className="listwell-app-page">
        <h1 className="vbg-title">Your businesses</h1>
        <p className="vbg-lede">
          <Link href="/sign-in?return=%2Faccount">Sign in</Link> to see
          businesses linked to your account.
        </p>
      </section>
    );
  }

  const reports = await listReportsForUser(user.id);
  return (
    <section className="listwell-app-page">
      <h1 className="vbg-title">Your businesses</h1>
      {reports.length === 0 ? (
        <>
          <p className="vbg-lede">No businesses yet.</p>
          <p className="vbg-lede">
            <Link href="/">Add a business</Link> from the chat to start a
            report.
          </p>
        </>
      ) : (
        <div className="vbg-table-wrap">
          <table>
            <caption className="vbg-caption">
              Businesses on your account.
            </caption>
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Plan</th>
                <th scope="col">Last scan</th>
                <th scope="col">Next scan</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <th scope="row">
                    <Link href={`/${report.id}`}>{report.name}</Link>
                  </th>
                  <td>{formatPlan(report.plan)}</td>
                  <td>
                    {report.lastScan?.score !== null &&
                    report.lastScan?.score !== undefined
                      ? `${report.lastScan.score}% · ${formatDate(report.lastScan.finishedAt)}`
                      : "—"}
                  </td>
                  <td>
                    {report.plan === "monthly"
                      ? formatDate(report.nextScanAt)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default AccountPage;
