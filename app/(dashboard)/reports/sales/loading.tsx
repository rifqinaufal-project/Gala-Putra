import { ReportLoadingSkeleton } from "@/components/reports/report-loading-skeleton";

export default function SalesReportLoading() {
  return <ReportLoadingSkeleton cards={4} chart="single" />;
}
