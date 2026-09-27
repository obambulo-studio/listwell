import Link from "next/link";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSessionUser, listReportsForUser } from "@/lib/auth";
import { probeConvexBusinesses } from "@/lib/data";

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

  const convexHealth = await probeConvexBusinesses();
  if (convexHealth === "error") {
    return (
      <section className="listwell-app-page">
        <h1 className="vbg-title">Your businesses</h1>
        <output className="vbg-lede">
          Account services are temporarily unavailable. Your sign-in is fine,
          but we cannot load your saved businesses right now. Try again shortly.
        </output>
      </section>
    );
  }

  let reports: Awaited<ReturnType<typeof listReportsForUser>> = [];
  try {
    reports = await listReportsForUser(user.id);
  } catch {
    return (
      <section className="listwell-app-page">
        <h1 className="vbg-title">Your businesses</h1>
        <output className="vbg-lede">
          We could not load your account data. Try again in a few minutes.
        </output>
      </section>
    );
  }

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
        <Table>
          <TableCaption>Businesses on your account.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Business</TableHead>
              <TableHead scope="col">Plan</TableHead>
              <TableHead scope="col">Last scan</TableHead>
              <TableHead scope="col">Next scan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">
                  <Link href={`/${report.id}`}>{report.name}</Link>
                </TableCell>
                <TableCell>{formatPlan(report.plan)}</TableCell>
                <TableCell>
                  {report.lastScan?.score !== null &&
                  report.lastScan?.score !== undefined
                    ? `${report.lastScan.score}% · ${formatDate(report.lastScan.finishedAt)}`
                    : "—"}
                </TableCell>
                <TableCell>
                  {report.plan === "monthly"
                    ? formatDate(report.nextScanAt)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
};

export default AccountPage;
