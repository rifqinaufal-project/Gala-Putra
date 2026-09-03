import type { Metadata } from "next";
import {
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Plus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { InternalCostCard } from "@/components/dashboard/internal-cost-card";
import { OutstandingInvoiceCard } from "@/components/dashboard/outstanding-invoice-card";
import { InvoiceOverviewGrid } from "@/components/dashboard/invoice-overview-grid";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { getDashboardDataAction } from "@/lib/actions/dashboard";
import { normalizeReportPeriod } from "@/lib/report-period";
import { getInventoryAction } from "@/lib/actions/inventory";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  }) {
  const params = await searchParams;
  const activePeriod = normalizeReportPeriod(typeof params.period === "string" ? params.period : undefined);
  const customStartDate = typeof params.startDate === "string" ? params.startDate : undefined;
  const customEndDate = typeof params.endDate === "string" ? params.endDate : undefined;
  const { periodInvoices, metrics: m, salesData, profitData, internalCosts, periodLabel, user, startDate, endDate } = await getDashboardDataAction(activePeriod, customStartDate, customEndDate);
  const canViewInternal = user.role !== "STAFF";
  const inventory = canViewInternal ? await getInventoryAction() : null;
  const totalStockValue = inventory?.balances
    .filter((balance) => balance.productStatus === "ACTIVE")
    .reduce((sum, balance) => sum + balance.stockValue, 0) ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ringkasan bisnis"
        description={`Pantau order, arus pendapatan, dan kewajiban dalam ${periodLabel.toLowerCase()}.`}
      >
        <ReportPeriodTabs path="/dashboard" activePeriod={activePeriod} startDate={startDate} endDate={endDate} />
        {canViewInternal && <Link href="/reports/sales" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Lihat laporan <ArrowRight className="ml-1 size-3.5" />
        </Link>}
        <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="mr-1 size-3.5" /> Buat invoice
        </Link>
      </PageHeader>

      {/* Snapshot metrics */}
      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Order dalam periode"
          value={m.ordersInPeriod}
          icon={ShoppingBag}
          change={m.ordersInPeriodChange}
          changeLabel="vs periode sebelumnya"
          href="/invoices"
        />
        <MetricCard
          title="Pendapatan periode"
          value={m.revenueInPeriod}
          isCurrency
          icon={ShoppingBag}
          change={m.revenueInPeriodChange}
          changeLabel="vs periode sebelumnya"
          href="/reports/sales"
        />
        <MetricCard
          title="Piutang berjalan"
          value={m.receivables}
          isCurrency
          icon={AlertCircle}
          href={canViewInternal ? "/reports/receivables" : undefined}
        />
        {canViewInternal && <MetricCard
          title="Laba Bersih"
          value={m.netProfitInPeriod}
          isCurrency
          icon={TrendingUp}
          change={m.netMarginInPeriod}
          changeLabel="margin"
          href="/reports/profit"
          internal
        />}
      </div>

      <InvoiceOverviewGrid invoices={periodInvoices} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesChart data={salesData} periodLabel={periodLabel} />
        {canViewInternal && <ProfitChart data={profitData} periodLabel={periodLabel} />}
      </div>

      {/* Row 3 — Internal Costs + Piutang summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {canViewInternal && <InternalCostCard
          costs={internalCosts}
          total={m.totalDirectCostsInPeriod}
        />}

        {/* Receivables summary */}
        {canViewInternal && <div className="erp-surface p-5">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Status Piutang
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total piutang
              </span>
              <span className="text-sm font-semibold text-foreground">
                {formatCurrency(m.receivables)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-sm text-red-600">Jatuh tempo</span>
              </div>
              <span className="text-sm font-semibold text-red-600">
                {m.overdueCount} invoice
              </span>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-2">
               {periodInvoices
                .filter((inv) => inv.status === "OVERDUE")
                .slice(0, 2)
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {inv.customerName}
                    </span>
                    <span className="text-xs font-medium text-red-600">
                      {formatCurrency(inv.remainingBalance)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>}

        {/* Quick stats */}
        {canViewInternal && <div className="erp-surface p-5">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Ringkasan Keuangan
          </p>
          <div className="space-y-3">
            {[
              {
                label: "Pendapatan",
                 value: formatCurrency(m.revenueInPeriod),
              },
              {
                label: "HPP Produk",
                 value: formatCurrency(m.revenueInPeriod - m.transactionProfitInPeriod - m.totalDirectCostsInPeriod),
                internal: true,
              },
              {
                label: "Biaya Internal",
                 value: formatCurrency(m.totalDirectCostsInPeriod),
                internal: true,
              },
              {
                label: "Pengeluaran Operasional",
                 value: formatCurrency(m.operatingExpensesInPeriod),
                internal: true,
              },
              {
                label: "Laba Bersih",
                 value: formatCurrency(m.netProfitInPeriod),
                highlight: true,
                internal: true,
              },
              {
                label: "Margin",
                 value: formatPercent(m.netMarginInPeriod),
                highlight: true,
                internal: true,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">
                    {row.label}
                  </span>
                  {row.internal && (
                    <span className="text-[9px] font-medium px-1 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                      Int
                    </span>
                  )}
                </div>
                <span
                  className={
                    row.highlight
                      ? "text-sm font-bold text-foreground"
                      : "text-sm font-medium text-foreground"
                  }
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <OutstandingInvoiceCard invoices={periodInvoices} />
        {canViewInternal && <MetricCard
          title="Nilai persediaan"
          value={totalStockValue}
          isCurrency
          icon={WalletCards}
          href="/stock"
          internal
          className="min-h-full"
        />}
      </div>
    </div>
  );
}
