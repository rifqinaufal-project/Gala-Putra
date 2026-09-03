import type { Metadata } from "next";
import { AlertTriangle, Landmark, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AddSupplierBillDialog } from "@/components/payables/add-supplier-bill-dialog";
import { SupplierPayablesTable } from "@/components/payables/supplier-payables-table";
import { getSupplierPayablesAction } from "@/lib/actions/supplier-payables";
import { getSuppliersAction } from "@/lib/actions/suppliers";
import { getProductOptionsAction } from "@/lib/actions/products";
import { requireRole } from "@/lib/security/auth";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { compareValues, normalizeSortDirection } from "@/lib/report-sort";
import { getReportPeriodRange, getTodayJakarta, normalizeReportPeriod } from "@/lib/report-period";

export const metadata: Metadata = { title: "Hutang Supplier" };

export default async function SupplierPayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireRole(["OWNER", "FINANCE"]);
  const params = await searchParams;
  const period = normalizeReportPeriod(typeof params.period === "string" ? params.period : undefined);
  const customStartDate = typeof params.startDate === "string" ? params.startDate : undefined;
  const customEndDate = typeof params.endDate === "string" ? params.endDate : undefined;
  const sort = typeof params.sort === "string" ? params.sort : "billDate";
  const direction = normalizeSortDirection(typeof params.direction === "string" ? params.direction : undefined);
  const range = getReportPeriodRange(period, getTodayJakarta(), [], customStartDate, customEndDate);
  const [periodBills, suppliers, products] = await Promise.all([
    getSupplierPayablesAction(period === "all" ? undefined : range.startDate, period === "all" ? undefined : range.endDate),
    getSuppliersAction(),
    getProductOptionsAction(),
  ]);
  const sortedBills = [...periodBills].sort((a, b) => {
    const values: Record<string, [string | number | undefined, string | number | undefined]> = {
      billNumber: [a.billNumber, b.billNumber],
      supplier: [a.supplierName, b.supplierName],
      billDate: [a.billDate, b.billDate],
      dueDate: [a.dueDate, b.dueDate],
      total: [a.total, b.total],
      remaining: [a.remainingBalance, b.remainingBalance],
      status: [a.status, b.status],
    };
    const [left, right] = values[sort] ?? values.billDate;
    return compareValues(left, right, direction);
  });
  const outstanding = periodBills.filter((bill) => bill.status !== "PAID" && bill.status !== "VOID");
  const totalPayables = outstanding.reduce((sum, bill) => sum + bill.remainingBalance, 0);
  const overdue = outstanding.filter((bill) => bill.status === "OVERDUE");
  const overdueAmount = overdue.reduce((sum, bill) => sum + bill.remainingBalance, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Hutang Supplier" description={`Pantau tagihan pembelian dan pembayaran yang harus diselesaikan ke supplier · ${range.label}`}>
        <ReportPeriodTabs path="/reports/supplier-payables" activePeriod={period} startDate={customStartDate} endDate={customEndDate} />
        <AddSupplierBillDialog suppliers={suppliers} products={products} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        <MetricCard accent="red" title="Total Hutang" value={totalPayables} isCurrency icon={Landmark} />
        <MetricCard accent="amber" title="Tagihan Jatuh Tempo" value={overdue.length} suffix="tagihan" icon={AlertTriangle} />
        <MetricCard accent="orange" title="Nilai Jatuh Tempo" value={overdueAmount} isCurrency icon={ReceiptText} />
      </div>

      <SupplierPayablesTable bills={sortedBills} sort={sort} direction={direction} period={period} />
    </div>
  );
}
