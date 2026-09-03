import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { getExpensesAction } from "@/lib/actions/expenses";
import { getInvoicesAction } from "@/lib/actions/invoices";
import { formatCurrency, formatPercent, getDirectCostLabel } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { InternalCostCard } from "@/components/dashboard/internal-cost-card";
import type { DirectCostCategory, InternalCostBreakdown } from "@/types";
import { requireRole } from "@/lib/security/auth";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { getReportPeriodRange, getTodayJakarta, normalizeReportPeriod } from "@/lib/report-period";

export const metadata: Metadata = {
  title: "Laporan Laba",
};

export default async function ProfitReportPage({
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
  const [invoices, periodExpenses] = await Promise.all([
    getInvoicesAction(period === "all" ? undefined : range.startDate, period === "all" ? undefined : range.endDate, true),
    getExpensesAction(period === "all" ? undefined : range.startDate, period === "all" ? undefined : range.endDate),
  ]);
  const issuedInvoices = invoices.filter((invoice) => invoice.status !== "DRAFT" && invoice.status !== "VOID");
  const daily = new Map<string, { profit: number; revenue: number }>();
  issuedInvoices.forEach((invoice) => {
    const value = daily.get(invoice.issueDate) ?? { profit: 0, revenue: 0 };
    value.profit += invoice.transactionProfit;
    value.revenue += invoice.total;
    daily.set(invoice.issueDate, value);
  });
  periodExpenses.forEach((expense) => {
    const value = daily.get(expense.expenseDate) ?? { profit: 0, revenue: 0 };
    value.profit -= expense.amount;
    daily.set(expense.expenseDate, value);
  });
  const profitData = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({
    date: new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit" }),
    profit: value.profit,
    margin: value.revenue > 0 ? (value.profit / value.revenue) * 100 : 0,
  }));
  const periodLabel = range.label;

  const totalRevenue = issuedInvoices.reduce((s, i) => s + i.total, 0);
  const totalHPP = issuedInvoices.reduce((s, i) => s + i.totalProductCost, 0);
  const totalDirectCost = issuedInvoices.reduce((s, i) => s + i.totalDirectCost, 0);
  const totalProfit = issuedInvoices.reduce((s, i) => s + i.transactionProfit, 0);
  const totalOperatingExpenses = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netProfit = totalProfit - totalOperatingExpenses;
  const avgMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Build internal costs breakdown from real invoices
  const costCategoryMap: Record<string, number> = {};
  issuedInvoices.forEach((inv) => {
    (inv.directCosts || []).forEach((dc) => {
      costCategoryMap[dc.category] = (costCategoryMap[dc.category] || 0) + dc.amount;
    });
  });

  const internalCosts: InternalCostBreakdown[] = Object.entries(costCategoryMap).map(([cat, amt]) => ({
    category: cat as DirectCostCategory,
    label: getDirectCostLabel(cat as DirectCostCategory),
    amount: amt,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Laba"
        description={`Omzet dikurangi HPP, biaya langsung, dan pengeluaran operasional · ${periodLabel}`}
      >
        <ReportPeriodTabs path="/reports/profit" activePeriod={period} startDate={customStartDate} endDate={customEndDate} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        <MetricCard accent="sky" title="Omzet" value={totalRevenue} isCurrency />
        <MetricCard accent="amber" title="HPP Produk" value={totalHPP} isCurrency internal />
        <MetricCard accent="emerald" title="Laba Kotor" value={totalRevenue - totalHPP} isCurrency internal />
        <MetricCard accent="orange" title="Biaya Langsung" value={totalDirectCost} isCurrency internal />
        <MetricCard accent="red" title="Pengeluaran" value={totalOperatingExpenses} isCurrency internal />
        <MetricCard accent="violet" title="Laba Bersih" value={netProfit} isCurrency internal />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ProfitChart data={profitData} periodLabel={periodLabel} />
        </div>
        <InternalCostCard
          costs={internalCosts.length > 0 ? internalCosts : []}
          total={totalDirectCost}
        />
      </div>

      {/* Summary card */}
      <div className="erp-surface p-5">
        <h3 className="text-sm font-semibold mb-4">Ringkasan Laba</h3>
        <div className="grid grid-cols-1 gap-5 min-[430px]:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {[
            { label: "Omzet", value: formatCurrency(totalRevenue) },
            { label: "HPP Produk", value: formatCurrency(totalHPP), internal: true },
            { label: "Biaya Langsung", value: formatCurrency(totalDirectCost), internal: true },
            { label: "Laba Produk", value: formatCurrency(totalRevenue - totalHPP), internal: true },
            { label: "Laba Transaksi", value: formatCurrency(totalProfit), internal: true },
            { label: "Pengeluaran Operasional", value: formatCurrency(totalOperatingExpenses), internal: true },
            { label: "Laba Bersih", value: formatCurrency(netProfit), internal: true, highlight: true },
            { label: "Margin Bersih", value: formatPercent(avgMargin), internal: true, highlight: true },
          ].map((row) => (
            <div key={row.label}>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                {row.label}
                {row.internal && (
                  <span className="text-[9px] px-1 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                    Int
                  </span>
                )}
              </p>
              <p
                className={`text-lg font-bold ${row.highlight ? "text-emerald-600" : "text-foreground"} tabular-nums`}
              >
                {row.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
