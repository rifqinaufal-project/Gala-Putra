import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { getDashboardDataAction } from "@/lib/actions/dashboard";
import { formatCurrency, formatDateShort, formatPercent } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CsvExportButton } from "@/components/ui/csv-export-button";
import { requireRole } from "@/lib/security/auth";
import { getInventorySummaryAction } from "@/lib/actions/inventory";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { SortableHeader } from "@/components/reports/sortable-header";
import { compareValues, getSortHref, normalizeSortDirection } from "@/lib/report-sort";
import { normalizeReportPeriod } from "@/lib/report-period";

export const metadata: Metadata = {
  title: "Laporan Penjualan",
};

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireRole(["OWNER", "FINANCE"]);
  const params = await searchParams;
  const period = normalizeReportPeriod(typeof params.period === "string" ? params.period : undefined);
  const customStartDate = typeof params.startDate === "string" ? params.startDate : undefined;
  const customEndDate = typeof params.endDate === "string" ? params.endDate : undefined;
  const sort = typeof params.sort === "string" ? params.sort : "issueDate";
  const direction = normalizeSortDirection(typeof params.direction === "string" ? params.direction : undefined);
  const [{ periodInvoices, salesData, periodLabel }, totalStockValue] = await Promise.all([
    getDashboardDataAction(period, customStartDate, customEndDate),
    getInventorySummaryAction(),
  ]);

  const issuedInvoices = periodInvoices.filter((inv) => inv.status !== "DRAFT" && inv.status !== "VOID");
  const sortedInvoices = [...issuedInvoices].sort((a, b) => {
    const values: Record<string, [string | number | undefined, string | number | undefined]> = {
      number: [a.invoiceNumber, b.invoiceNumber],
      customer: [a.customerName, b.customerName],
      issueDate: [a.issueDate, b.issueDate],
      revenue: [a.total, b.total],
      hpp: [a.totalProductCost, b.totalProductCost],
      directCost: [a.totalDirectCost, b.totalDirectCost],
      profit: [a.transactionProfit, b.transactionProfit],
      margin: [a.transactionMargin, b.transactionMargin],
    };
    const [left, right] = values[sort] ?? values.issueDate;
    return compareValues(left, right, direction);
  });
  const totalRevenue = issuedInvoices.reduce((s, i) => s + i.total, 0);
  const totalHPP = issuedInvoices.reduce((s, i) => s + i.totalProductCost, 0);
  const totalProfit = issuedInvoices.reduce((s, i) => s + i.transactionProfit, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Laporan Penjualan" description="Analisis penjualan per periode">
        <ReportPeriodTabs path="/reports/sales" activePeriod={period} startDate={customStartDate} endDate={customEndDate} />
        <CsvExportButton filename="laporan-penjualan.csv" headers={["Nomor", "Restoran", "Tanggal", "Pendapatan", "HPP", "Biaya", "Laba", "Margin"]} rows={issuedInvoices.map((invoice) => [invoice.invoiceNumber, invoice.customerName, invoice.issueDate, invoice.total, invoice.totalProductCost, invoice.totalDirectCost, invoice.transactionProfit, invoice.transactionMargin])} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-4">
        <MetricCard accent="emerald" title="Total Pendapatan" value={totalRevenue} isCurrency />
        <MetricCard accent="sky" title="Total Invoice" value={issuedInvoices.length} suffix="invoice" />
        <MetricCard accent="blue"
          title="Laba Transaksi"
          value={totalProfit}
          isCurrency
          internal
        />
        <MetricCard
          accent="amber"
          title="Modal"
          value={totalHPP + totalStockValue}
          isCurrency
          suffix="HPP + persediaan"
          internal
        />
      </div>

      <SalesChart data={salesData} periodLabel={periodLabel} />

      <div className="erp-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Daftar Invoice Penjualan</h3>
        </div>
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <SortableHeader label="Nomor" href={getSortHref("/reports/sales", period, "number", sort, direction)} active={sort === "number"} direction={direction} />
                <SortableHeader label="Restoran" href={getSortHref("/reports/sales", period, "customer", sort, direction)} active={sort === "customer"} direction={direction} />
                <SortableHeader label="Tanggal" href={getSortHref("/reports/sales", period, "issueDate", sort, direction)} active={sort === "issueDate"} direction={direction} />
                <SortableHeader label="Pendapatan" href={getSortHref("/reports/sales", period, "revenue", sort, direction)} active={sort === "revenue"} direction={direction} className="text-right" />
                <SortableHeader label="HPP" href={getSortHref("/reports/sales", period, "hpp", sort, direction)} active={sort === "hpp"} direction={direction} className="text-right" />
                <SortableHeader label="Biaya Langsung" href={getSortHref("/reports/sales", period, "directCost", sort, direction)} active={sort === "directCost"} direction={direction} className="text-right" />
                <SortableHeader label="Laba" href={getSortHref("/reports/sales", period, "profit", sort, direction)} active={sort === "profit"} direction={direction} className="text-right" />
                <SortableHeader label="Margin" href={getSortHref("/reports/sales", period, "margin", sort, direction)} active={sort === "margin"} direction={direction} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedInvoices.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-mono font-medium">
                    {inv.invoiceNumber ?? "DRAFT"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {inv.customerName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateShort(inv.issueDate)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatCurrency(inv.total)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {formatCurrency(inv.totalProductCost)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {formatCurrency(inv.totalDirectCost)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-emerald-600 tabular-nums">
                    {formatCurrency(inv.transactionProfit)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatPercent(inv.transactionMargin)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="divide-y divide-border lg:hidden">
          {issuedInvoices.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Belum ada invoice penjualan pada periode ini.</p>
          ) : (
            sortedInvoices.map((invoice) => (
              <article key={invoice.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-stone-900">{invoice.invoiceNumber ?? "DRAFT"}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{invoice.customerName} · {formatDateShort(invoice.issueDate)}</p>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-[11px] text-stone-500">Pendapatan</p><p className="mt-1 text-sm font-bold tabular-nums text-stone-900">{formatCurrency(invoice.total)}</p></div>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-xl bg-stone-50 p-3 text-xs min-[430px]:grid-cols-3">
                  <div><p className="text-stone-500">HPP</p><p className="mt-1 font-medium tabular-nums text-stone-800">{formatCurrency(invoice.totalProductCost)}</p></div>
                  <div className="border-y border-stone-200 py-2 min-[430px]:border-x min-[430px]:border-y-0 min-[430px]:px-2 min-[430px]:py-0"><p className="text-stone-500">Biaya</p><p className="mt-1 font-medium tabular-nums text-stone-800">{formatCurrency(invoice.totalDirectCost)}</p></div>
                  <div className="text-right"><p className="text-stone-500">Laba</p><p className="mt-1 font-bold tabular-nums text-emerald-600">{formatCurrency(invoice.transactionProfit)}</p></div>
                </div>
                <p className="text-right text-xs text-stone-500">Margin <span className="font-semibold text-stone-800">{formatPercent(invoice.transactionMargin)}</span></p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
