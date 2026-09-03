import type { Metadata } from "next";
import { Plus, ReceiptText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell/page-header";
import { InvoiceListTable } from "@/components/invoices/invoice-list-table";
import { getInvoicesAction } from "@/lib/actions/invoices";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { CsvExportButton } from "@/components/ui/csv-export-button";
import { requireApprovedUser } from "@/lib/security/auth";
import { getCompanyProfileAction } from "@/lib/actions/company";

export const metadata: Metadata = {
  title: "Invoice",
};

export default async function InvoicesPage() {
  const [invoices, user, company] = await Promise.all([getInvoicesAction(), requireApprovedUser(), getCompanyProfileAction()]);

  // Filter out VOID (Dibatalkan) invoices from total active billings calculation
  const activeInvoices = invoices.filter((inv) => inv.status !== "VOID");
  const totalInvoiceCount = activeInvoices.length;
  const totalInvoiceAmount = activeInvoices.reduce((acc, inv) => acc + inv.total, 0);

  const unpaidInvoices = invoices.filter(
    (inv) => inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID" || inv.status === "OVERDUE"
  );
  const unpaidCount = unpaidInvoices.length;
  const totalUnpaidAmount = unpaidInvoices.reduce((acc, inv) => acc + inv.remainingBalance, 0);

  const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
  const paidCount = paidInvoices.length;
  const totalPaidAmount = paidInvoices.reduce((acc, inv) => acc + inv.total, 0);

  const overdueInvoices = invoices.filter((inv) => inv.status === "OVERDUE");
  const overdueCount = overdueInvoices.length;
  const paymentProgress = totalInvoiceAmount > 0 ? Math.min((totalPaidAmount / totalInvoiceAmount) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice"
        description="Kelola invoice dan pembayaran restoran"
      >
        <CsvExportButton filename="invoice.csv" label="Ekspor" headers={["Nomor", "Restoran", "Tanggal", "Status", "Total", "Dibayar", "Sisa"]} rows={invoices.map((invoice) => [invoice.invoiceNumber, invoice.customerName, invoice.issueDate, invoice.status, invoice.total, invoice.totalPaid, invoice.remainingBalance])} />
        <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="w-4 h-4 mr-1" />
          Buat Invoice
        </Link>
      </PageHeader>

      <section className="erp-surface overflow-hidden" aria-labelledby="invoice-summary-title">
        {/* Top section */}
        <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p id="invoice-summary-title" className="mb-1 text-xs font-medium text-muted-foreground">Total tagihan aktif</p>
            <p className="break-words text-[clamp(1.55rem,4vw,2rem)] font-bold leading-tight tracking-[-0.04em] text-foreground tabular-nums">{formatCurrency(totalInvoiceAmount)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/9 text-primary">
              <ReceiptText className="size-4" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none text-foreground tabular-nums">{totalInvoiceCount}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Invoice</p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-5 sm:px-6">
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Progres pembayaran invoice"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(paymentProgress)}
          >
            {totalInvoiceCount > 0 && (<>
              <div className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(paidCount / totalInvoiceCount) * 100}%` }} />
              <div className="h-full bg-amber-400 transition-[width] duration-500" style={{ width: `${(unpaidCount / totalInvoiceCount) * 100}%` }} />
              <div className="h-full bg-red-500 transition-[width] duration-500" style={{ width: `${(overdueCount / totalInvoiceCount) * 100}%` }} />
            </>)}
          </div>
        </div>

        {/* Bottom stats */}
        <div className="grid grid-cols-1 border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
          {/* Lunas */}
          <div className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-4 sm:block sm:border-b-0 sm:px-6">
            <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Lunas</span>
            </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">{paidCount} invoice</p>
            </div>
            <p className="text-right text-sm font-bold text-foreground tabular-nums sm:mt-2 sm:text-left sm:text-base">{formatCurrency(totalPaidAmount)}</p>
          </div>

          {/* Belum Lunas */}
          <div className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-4 sm:block sm:border-b-0 sm:px-6">
            <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Belum Lunas</span>
            </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">{unpaidCount} invoice</p>
            </div>
            <p className="text-right text-sm font-bold text-foreground tabular-nums sm:mt-2 sm:text-left sm:text-base">{formatCurrency(totalUnpaidAmount)}</p>
          </div>

          {/* Jatuh Tempo */}
          <div className="flex flex-row items-center justify-between gap-4 px-5 py-4 sm:block sm:px-6">
            <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Jatuh Tempo</span>
            </div>
              <p className={`mt-1 text-xs tabular-nums ${overdueCount > 0 ? "text-red-500" : "text-muted-foreground/50"}`}>{overdueCount} invoice</p>
            </div>
            <p className={`text-right text-sm font-bold tabular-nums sm:mt-2 sm:text-left sm:text-base ${overdueCount > 0 ? "text-red-600" : "text-muted-foreground/40"}`}>
              {overdueCount > 0 ? formatCurrency(overdueInvoices.reduce((acc, inv) => acc + inv.remainingBalance, 0)) : "—"}
            </p>
          </div>
        </div>
      </section>

      <InvoiceListTable initialInvoices={invoices} role={user.role} company={company} />
    </div>
  );
}
