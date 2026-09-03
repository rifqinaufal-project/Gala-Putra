"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, CircleAlert, FileText } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import type { Invoice, InvoiceStatus } from "@/types";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { cn } from "@/lib/utils";

type InvoiceFilter = "ALL" | "OPEN" | "PARTIALLY_PAID" | "OVERDUE" | "PAID";

const filters: Array<{ value: InvoiceFilter; label: string }> = [
  { value: "ALL", label: "Semua" },
  { value: "OPEN", label: "Terbuka" },
  { value: "PARTIALLY_PAID", label: "Sebagian" },
  { value: "OVERDUE", label: "Jatuh tempo" },
  { value: "PAID", label: "Lunas" },
];

function matchesFilter(invoice: Invoice, filter: InvoiceFilter) {
  if (filter === "ALL") return true;
  if (filter === "OPEN") return invoice.status === "DRAFT" || invoice.status === "ISSUED";
  return invoice.status === filter;
}

function paymentProgress(invoice: Invoice) {
  if (invoice.total <= 0) return invoice.status === "PAID" ? 100 : 0;
  return Math.max(0, Math.min(100, (invoice.totalPaid / invoice.total) * 100));
}

function statusTone(status: InvoiceStatus) {
  if (status === "PAID") return "bg-emerald-400";
  if (status === "OVERDUE") return "bg-red-400";
  if (status === "PARTIALLY_PAID") return "bg-amber-400";
  return "bg-[#a8a5f5]";
}

export function InvoiceOverviewGrid({ invoices }: { invoices: Invoice[] }) {
  const [filter, setFilter] = useState<InvoiceFilter>("ALL");
  const visibleInvoices = invoices.filter((invoice) => matchesFilter(invoice, filter)).slice(0, 6);

  return (
    <section className="erp-surface overflow-hidden" aria-labelledby="invoice-overview-title">
      <div className="flex flex-col gap-4 border-b border-border/70 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FileText className="size-4" /></div>
            <h2 id="invoice-overview-title" className="text-sm font-semibold tracking-[-0.01em] text-foreground">Invoice dan tagihan</h2>
          </div>
          <p className="mt-1 pl-10 text-xs text-muted-foreground">Pantau invoice terbaru dan status pembayarannya.</p>
        </div>
        <Link href="/invoices/new" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-transform hover:bg-[#343640] active:scale-[0.985]">
          Buat invoice <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-white/45 px-4 py-2 sm:px-5" role="tablist" aria-label="Filter invoice">
        {filters.map((item) => {
          const active = filter === item.value;
          return (
            <button key={item.value} type="button" role="tab" aria-selected={active} onClick={() => setFilter(item.value)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors", active ? "bg-accent text-accent-foreground shadow-[0_1px_5px_rgba(0,0,0,0.1)]" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item.label}</button>
          );
        })}
      </div>

      {visibleInvoices.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><CircleAlert className="size-4" /></div>
          <p className="text-sm font-semibold text-foreground">Tidak ada invoice pada filter ini</p>
          <p className="mt-1 text-xs text-muted-foreground">Coba pilih status lain atau buat invoice baru.</p>
        </div>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
          {visibleInvoices.map((invoice) => {
            const progress = paymentProgress(invoice);
            return (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="group flex min-h-[190px] flex-col rounded-2xl border border-border/70 bg-[#fafaff] p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card focus-visible:outline-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-white text-muted-foreground"><FileText className="size-4" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{invoice.customerName}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{invoice.invoiceNumber ?? "Draft"}</p>
                    </div>
                  </div>
                  <InvoiceStatusBadge status={invoice.status} className="shrink-0" />
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total invoice</p>
                    <p className="mt-0.5 text-base font-bold tracking-[-0.025em] text-foreground tabular-nums">{formatCurrency(invoice.total)}</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Dibayar {formatCurrency(invoice.totalPaid)}</span>
                    <span className="tabular-nums">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#e5e6f2]"><div className={cn("h-full rounded-full transition-[width] duration-300", statusTone(invoice.status))} style={{ width: `${progress}%` }} /></div>
                </div>

                <div className="mt-auto flex items-center gap-1.5 pt-3 text-[10px] text-muted-foreground">
                  <CalendarDays className="size-3" />
                  <span>{invoice.dueDate ? `Jatuh tempo ${formatDateShort(invoice.dueDate)}` : "Belum ada jatuh tempo"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
