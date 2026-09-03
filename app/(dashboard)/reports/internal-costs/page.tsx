import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { getInvoicesAction } from "@/lib/actions/invoices";
import { formatCurrency, formatPercent, getDirectCostLabel } from "@/lib/utils";
import { InternalCostCard } from "@/components/dashboard/internal-cost-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import type { DirectCostCategory, InternalCostBreakdown } from "@/types";
import { requireRole } from "@/lib/security/auth";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { getReportPeriodRange, getTodayJakarta, normalizeReportPeriod } from "@/lib/report-period";

export const metadata: Metadata = {
  title: "Biaya Internal",
};

export default async function InternalCostsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireRole(["OWNER", "FINANCE"]);
  const params = await searchParams;
  const period = normalizeReportPeriod(typeof params.period === "string" ? params.period : undefined);
  const customStartDate = typeof params.startDate === "string" ? params.startDate : undefined;
  const customEndDate = typeof params.endDate === "string" ? params.endDate : undefined;
  const range = getReportPeriodRange(period, getTodayJakarta(), [], customStartDate, customEndDate);
  const invoices = await getInvoicesAction(period === "all" ? undefined : range.startDate, period === "all" ? undefined : range.endDate, true);
  const issuedInvoices = invoices.filter((invoice) => invoice.status !== "DRAFT" && invoice.status !== "VOID");
  const periodLabel = range.label;

  const totalDirectCost = issuedInvoices.reduce((s, i) => s + i.totalDirectCost, 0);

  // Aggregate costs by category
  const categoryMap: Record<string, number> = {};
  issuedInvoices.forEach((inv) => {
    (inv.directCosts || []).forEach((dc) => {
      categoryMap[dc.category] = (categoryMap[dc.category] || 0) + dc.amount;
    });
  });

  const internalCostsList: InternalCostBreakdown[] = Object.entries(categoryMap).map(([cat, amt]) => ({
        category: cat as DirectCostCategory,
        label: getDirectCostLabel(cat as DirectCostCategory),
        amount: amt,
      }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biaya Internal"
        description={`Rincian biaya langsung per invoice · ${periodLabel}`}
      >
        <ReportPeriodTabs path="/reports/internal-costs" activePeriod={period} startDate={customStartDate} endDate={customEndDate} />
      </PageHeader>

      <MetricCard accent="blue"
        title="Total Biaya Internal"
        value={totalDirectCost}
        isCurrency
        internal
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <InternalCostCard costs={internalCostsList} total={totalDirectCost} />

        <div className="erp-surface border-amber-200 p-5">
          <h3 className="text-sm font-semibold mb-4 text-amber-800">
            Breakdown Kategori
          </h3>
          <div className="space-y-3">
            {internalCostsList.map((c) => {
              const currentTotal = totalDirectCost;
              const pct = currentTotal > 0 ? (c.amount / currentTotal) * 100 : 0;
              return (
                <div key={c.category} className="flex items-center gap-4">
                  <div className="w-24 flex-shrink-0">
                    <p className="text-xs font-medium text-foreground">{c.label}</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-amber-100 rounded-full">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 w-28">
                    <p className="text-xs font-semibold tabular-nums">
                      {formatCurrency(c.amount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatPercent(pct)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
