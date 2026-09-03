import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvoiceByIdAction } from "@/lib/actions/invoices";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getDirectCostLabel,
  formatQuantity,
  getBillingQuantity,
  parseProductDescription,
} from "@/lib/utils";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoicePdfDownload } from "@/components/invoices/invoice-pdf-download";
import { WhatsAppButton } from "@/components/invoices/whatsapp-button";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Lock,
  PackageOpen,
  Pencil,
  ReceiptText,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { getCompanyProfileAction } from "@/lib/actions/company";
import { requireApprovedUser } from "@/lib/security/auth";
import { IssueInvoiceButton } from "@/components/invoices/issue-invoice-button";

export const metadata: Metadata = {
  title: "Detail Invoice",
};

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [invoice, company, user] = await Promise.all([getInvoiceByIdAction(id), getCompanyProfileAction(), requireApprovedUser()]);
  if (!invoice) notFound();

  const canViewInternal = user.role !== "STAFF";
  const isInternal = canViewInternal &&
    invoice.status !== "VOID" && invoice.status !== "DRAFT";
  const paymentProgress = invoice.total > 0
    ? Math.min((invoice.totalPaid / invoice.total) * 100, 100)
    : 0;
  const marginProgress = Math.min(100, Math.max(0, invoice.transactionMargin));
  const isPaid = invoice.remainingBalance <= 0;

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-black/[0.06] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/invoices"
            aria-label="Kembali ke daftar invoice"
            className={buttonVariants({
              variant: "outline",
              size: "icon",
              className: "mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-white shadow-sm",
            })}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Detail Invoice
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="break-all text-2xl font-semibold tracking-[-0.03em] text-foreground">
                {invoice.invoiceNumber ?? "Draft"}
              </h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.customerName} · {formatDate(invoice.issueDate)}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-black/[0.06] bg-white/80 p-2 shadow-sm backdrop-blur lg:w-auto [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:grow [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-3 lg:[&_[data-slot=button]]:grow-0">
          {canViewInternal && invoice.status === "DRAFT" && <IssueInvoiceButton invoiceId={invoice.id} />}
          {canViewInternal && invoice.status !== "VOID" && invoice.status !== "DRAFT" && (
          <Link
            href={`/invoices/${invoice.id}/edit`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "rounded-xl bg-white shadow-sm" })}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit Invoice
          </Link>
        )}
        <WhatsAppButton invoice={invoice} customerPhone={invoice.customerPhone} company={company} />
          <InvoicePdfDownload invoice={invoice} company={company} />
          {canViewInternal && (invoice.status === "ISSUED" ||
            invoice.status === "PARTIALLY_PAID" ||
            invoice.status === "OVERDUE") && (
            <RecordPaymentDialog defaultInvoiceId={invoice.id} invoices={[invoice]} />
          )}
          {canViewInternal && invoice.status === "PAID" && (
            <RecordPaymentDialog defaultInvoiceId={invoice.id} invoices={[invoice]} />
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-7">
        {/* Main content */}
        <div className="min-w-0 space-y-5">
          {/* Customer info */}
          <section className="rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_30px_rgba(15,23,42,0.035)] sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                <UserRound className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Informasi Pelanggan</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Identitas pelanggan dan periode penagihan.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  <UserRound className="size-3" /> Restoran
                </p>
                <p className="font-semibold text-stone-800">{invoice.customerName}</p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  <CalendarDays className="size-3" /> Tanggal Invoice
                </p>
                <p className="font-semibold text-stone-800">{formatDate(invoice.issueDate)}</p>
              </div>
              {invoice.dueDate && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                    <Clock3 className="size-3" /> Jatuh Tempo
                  </p>
                  <p
                    className={`font-semibold ${invoice.status === "OVERDUE" ? "text-red-600" : "text-stone-800"}`}
                  >
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
              )}
              {invoice.invoiceNumber && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                    <ReceiptText className="size-3" /> Nomor Invoice
                  </p>
                  <p className="break-all font-mono text-xs font-semibold text-stone-800">{invoice.invoiceNumber}</p>
                </div>
              )}
            </div>
          </section>

          {/* Items */}
          <section className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_30px_rgba(15,23,42,0.035)]">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                  <PackageOpen className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Item Produk</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Rincian produk pada saat invoice diterbitkan.</p>
                </div>
              </div>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-500">
                {invoice.items.length} item
              </span>
            </div>

            <div className="erp-table-wrap hidden md:block">
              <table className="erp-table min-w-[720px] w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/80">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Produk
                    </th>
                    <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Ukuran / Size
                    </th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Qty
                    </th>
                    <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Satuan
                    </th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Harga Jual
                    </th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {invoice.items.map((item) => {
                    const { name, size } = parseProductDescription(
                      item.descriptionSnapshot,
                      (item as unknown as { size?: string }).size
                    );
                    return (
                      <tr key={item.id} className="transition-colors hover:bg-stone-50/60">
                        <td className="px-5 py-3.5 font-semibold text-stone-900">
                          {name}
                        </td>
                        <td className="px-3 py-3.5 text-xs">
                          {size !== "—" ? (
                            <span className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 font-mono font-bold text-sky-700">
                              {size}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right font-medium tabular-nums text-stone-700">
                           {formatQuantity(getBillingQuantity(item.quantity, item.marginQuantity))}
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground">
                          {item.unit}
                        </td>
                        <td className="px-3 py-3.5 text-right font-medium tabular-nums text-stone-700">
                          {formatCurrency(item.sellingPriceSnapshot)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold tabular-nums text-stone-900">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-stone-200 bg-stone-50/60">
                  {invoice.discount > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-2.5 text-right text-xs font-medium text-muted-foreground"
                      >
                        Diskon
                      </td>
                      <td className="px-5 py-2.5 text-right text-sm font-semibold tabular-nums text-red-600">
                        -{formatCurrency(invoice.discount)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-stone-500"
                    >
                      Total
                    </td>
                    <td className="px-5 py-3.5 text-right text-xl font-bold tracking-[-0.02em] tabular-nums text-stone-900">
                      {formatCurrency(invoice.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="divide-y divide-stone-100 md:hidden">
              {invoice.items.map((item, index) => {
                const { name, size } = parseProductDescription(
                  item.descriptionSnapshot,
                  (item as unknown as { size?: string }).size
                );
                return (
                  <article key={item.id} className="space-y-4 px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Item {index + 1}</p>
                        <h3 className="mt-1 text-sm font-semibold text-stone-900">{name}</h3>
                      </div>
                      {size !== "—" && (
                        <span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-xs font-bold text-sky-700">{size}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Qty</p>
                         <p className="mt-1 text-sm font-semibold tabular-nums text-stone-700">{formatQuantity(getBillingQuantity(item.quantity, item.marginQuantity))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Satuan</p>
                        <p className="mt-1 text-sm font-semibold text-stone-700">{item.unit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Harga</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-stone-700">{formatCurrency(item.sellingPriceSnapshot)}</p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between border-t border-dashed border-stone-200 pt-3">
                      <span className="text-xs font-medium text-muted-foreground">Subtotal</span>
                      <span className="text-base font-bold tracking-[-0.02em] tabular-nums text-stone-900">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </article>
                );
              })}
              <div className="space-y-2 bg-stone-50/70 px-5 py-4">
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Diskon</span>
                    <span className="font-semibold tabular-nums text-red-600">-{formatCurrency(invoice.discount)}</span>
                  </div>
                )}
                <div className="flex items-end justify-between border-t border-stone-200 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total</span>
                  <span className="text-xl font-bold tracking-[-0.03em] tabular-nums text-stone-900">{formatCurrency(invoice.total)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Internal costs */}
          {isInternal && invoice.directCosts.length > 0 && (
            <section className="overflow-hidden rounded-[20px] border border-amber-200/80 bg-white shadow-[0_1px_2px_rgba(120,53,15,0.03),0_12px_30px_rgba(120,53,15,0.035)]">
              <div className="flex items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50/60 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-100/70 text-amber-700">
                    <WalletCards className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold tracking-[-0.01em] text-amber-950">Biaya Internal</h2>
                    <p className="mt-0.5 text-xs text-amber-700/75">Biaya operasional khusus transaksi ini.</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-white/70 px-2 py-1 text-[10px] font-semibold text-amber-700"><Lock className="size-3" /> Privat</span>
              </div>
              <div className="divide-y divide-stone-100">
                {invoice.directCosts.map((cost) => (
                  <div
                    key={cost.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6"
                  >
                    <div>
                      <p className="text-sm font-semibold text-stone-800">{cost.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {getDirectCostLabel(cost.category)}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-stone-800">
                      {formatCurrency(cost.amount)}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 bg-amber-50/50 px-5 py-3.5 sm:px-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                    Total Biaya Internal
                  </p>
                  <p className="text-base font-bold tabular-nums text-amber-900">
                    {formatCurrency(invoice.totalDirectCost)}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 xl:sticky xl:top-24">
          {/* Payment status */}
          <section className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_36px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-4">
              <div className={`flex size-9 items-center justify-center rounded-xl ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-700"}`}>
                {isPaid ? <CheckCircle2 className="size-4" /> : <CreditCard className="size-4" />}
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-stone-900">Status Pembayaran</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{isPaid ? "Invoice telah lunas." : "Pantau progres pembayaran."}</p>
              </div>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <div className="space-y-2.5">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Total tagihan</span>
                  <span className="font-semibold tabular-nums text-stone-800">
                    {formatCurrency(invoice.total)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Sudah dibayar</span>
                  <span className="font-semibold tabular-nums text-emerald-700">
                    {formatCurrency(invoice.totalPaid)}
                  </span>
                </div>
              </div>
              <div className={`rounded-2xl border p-4 ${isPaid ? "border-emerald-200 bg-emerald-50/80" : "border-stone-200 bg-stone-50"}`}>
                <div className="flex items-end justify-between gap-4">
                  <span className={`text-xs font-semibold ${isPaid ? "text-emerald-700" : "text-stone-600"}`}>Sisa tagihan</span>
                  <span
                    className={
                      invoice.remainingBalance > 0
                        ? "text-xl font-bold tracking-[-0.03em] tabular-nums text-stone-900"
                        : "text-lg font-bold tabular-nums text-emerald-700"
                    }
                  >
                    {invoice.remainingBalance > 0
                      ? formatCurrency(invoice.remainingBalance)
                      : "Lunas"}
                  </span>
                </div>
                {invoice.total > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[10px] font-medium text-stone-400">
                      <span>Progres pembayaran</span>
                      <span className="tabular-nums">{Math.round(paymentProgress)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-200/80">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
                        style={{ width: `${paymentProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Internal profit summary */}
          {canViewInternal && <section className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_36px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-stone-100 text-stone-700"><ReceiptText className="size-4" /></div>
                <div>
                  <h2 className="text-sm font-semibold tracking-[-0.01em] text-stone-900">Ringkasan Internal</h2>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">Analisis transaksi</p>
                </div>
              </div>
              <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700"><Lock className="size-3" /> Privat</span>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <div className="space-y-2.5 rounded-xl bg-stone-50 p-3.5">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Pendapatan</span>
                  <span className="font-semibold tabular-nums text-stone-800">
                    {formatCurrency(invoice.total)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <span>HPP Produk</span>
                  <span className="tabular-nums">
                    {formatCurrency(invoice.totalProductCost)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <span>Biaya Internal</span>
                  <span className="tabular-nums">
                    {formatCurrency(invoice.totalDirectCost)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-4 text-emerald-800">
                  <span className="text-xs font-semibold">Laba Transaksi</span>
                  <span className="text-base font-bold tracking-[-0.02em] tabular-nums">{formatCurrency(invoice.transactionProfit)}</span>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <span className="text-xs font-medium text-emerald-700">Margin</span>
                  <span className="text-3xl font-bold tracking-[-0.04em] tabular-nums text-emerald-800">
                    {formatPercent(invoice.transactionMargin)}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-200/70">
                  <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${marginProgress}%` }} />
                </div>
              </div>
            </div>
          </section>}
        </aside>
      </div>
    </div>
  );
}
