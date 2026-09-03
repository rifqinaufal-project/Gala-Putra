import Link from "next/link";
import type { ReportPeriod } from "@/lib/report-period";
import { CustomPeriodTab } from "@/components/reports/custom-period-tab";

const tabs: Array<{ value: ReportPeriod; label: string }> = [
  { value: "1d", label: "1 hari" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "all", label: "Semua" },
];

interface ReportPeriodTabsProps {
  path: string;
  activePeriod: ReportPeriod;
  className?: string;
  startDate?: string;
  endDate?: string;
}

export function ReportPeriodTabs({ path, activePeriod, className, startDate, endDate }: ReportPeriodTabsProps) {
  return (
    <nav className={`flex items-center rounded-full border border-border/70 bg-muted/60 p-1 ${className ?? ""}`} aria-label="Pilih periode laporan">
      {tabs.map((tab) => {
        const isActive = activePeriod === tab.value;
        return (
          <Link
            key={tab.value}
            href={`${path}?period=${tab.value}`}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-center text-xs font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 ${isActive ? "bg-white text-foreground shadow-[0_1px_5px_rgba(0,0,0,0.1)]" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
      <CustomPeriodTab path={path} active={activePeriod === "custom"} startDate={startDate} endDate={endDate} />
    </nav>
  );
}
