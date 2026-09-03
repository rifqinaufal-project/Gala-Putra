import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { PaymentListTable } from "@/components/payments/payment-list-table";
import { getPaymentsAction } from "@/lib/actions/payments";
import { getInvoicesAction } from "@/lib/actions/invoices";
import { MetricCard } from "@/components/dashboard/metric-card";
import { CreditCard, AlertCircle } from "lucide-react";
import { requireRole } from "@/lib/security/auth";

export const metadata: Metadata = {
  title: "Pembayaran",
};

export default async function PaymentsPage() {
  await requireRole(["OWNER", "FINANCE"]);
  const payments = await getPaymentsAction();
  const invoices = await getInvoicesAction();

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const receivables = invoices
    .filter((i) => i.status !== "VOID" && i.status !== "PAID")
    .reduce((s, i) => s + i.remainingBalance, 0);
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Pembayaran" description="Riwayat pembayaran invoice">
        <RecordPaymentDialog invoices={invoices} />
      </PageHeader>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          accent="amber"
          title="Total Piutang"
          value={receivables}
          isCurrency
          icon={AlertCircle}
          href="/reports/receivables"
        />
        <MetricCard
          accent="emerald"
          title="Pembayaran Masuk"
          value={totalPaid}
          isCurrency
          icon={CreditCard}
        />
        <MetricCard
          accent="red"
          title="Invoice Overdue"
          value={overdueCount}
          icon={AlertCircle}
          suffix="invoice"
        />
      </div>

      {/* Payments table with proof viewer */}
      <PaymentListTable payments={payments} invoices={invoices} />
    </div>
  );
}
