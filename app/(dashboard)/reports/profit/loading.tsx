import { ReportLoadingSkeleton } from "@/components/reports/report-loading-skeleton";

export default function ProfitReportLoading() {
  return <ReportLoadingSkeleton cards={6} chart="split" breakdown />;
}
