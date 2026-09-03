"use client";

import { useState } from "react";
import {
  formatCurrency,
  formatDateShort,
} from "@/lib/utils";
import type { Invoice, InvoiceStatus, Role } from "@/types";
import type { CompanyProfile } from "@/lib/company-store";
import {
  Search,
  MoreHorizontal,
  FileText,
  Download,
  Eye,
  CreditCard,
  Loader2,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { handleDownloadInvoicePdf } from "./invoice-pdf-download";

import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { deleteInvoiceAction, voidInvoiceAction } from "@/lib/actions/invoices";
import { useRouter } from "next/navigation";
import { Trash2, Ban } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const STATUS_FILTERS: { label: string; value: InvoiceStatus | "ALL" }[] = [
  { label: "Semua", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Diterbitkan", value: "ISSUED" },
  { label: "Dibayar Sebagian", value: "PARTIALLY_PAID" },
  { label: "Lunas", value: "PAID" },
  { label: "Jatuh Tempo", value: "OVERDUE" },
];

interface InvoiceListTableProps {
  initialInvoices?: Invoice[];
  role: Role;
  company: CompanyProfile;
}

export function InvoiceListTable({ initialInvoices = [], role, company }: InvoiceListTableProps) {
  const router = useRouter();
  const [invoicesList, setInvoicesList] = useState<Invoice[]>(
    initialInvoices
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">(
    "ALL"
  );
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [voidingInvoice, setVoidingInvoice] = useState<Invoice | null>(null);
  const [selectedPaymentInvoiceId, setSelectedPaymentInvoiceId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const handleConfirmDeleteInvoice = async () => {
    if (!deletingInvoice) return;
    const targetId = deletingInvoice.id;
    setDeletingInvoice(null);
    setInvoicesList((prev) => prev.filter((inv) => inv.id !== targetId));

    const res = await deleteInvoiceAction(targetId);
    if (res.error) {
      toast.error(`Gagal menghapus: ${res.error}`);
      router.refresh();
    } else {
      toast.success(res.message || "Invoice berhasil dihapus");
      router.refresh();
    }
  };

  const handleConfirmVoidInvoice = async () => {
    if (!voidingInvoice) return;
    const targetId = voidingInvoice.id;
    setVoidingInvoice(null);
    setInvoicesList((prev) =>
      prev.map((inv) => (inv.id === targetId ? { ...inv, status: "VOID", remainingBalance: 0 } : inv))
    );

    const res = await voidInvoiceAction(targetId);
    if (res.error) {
      toast.error(`Gagal membatalkan: ${res.error}`);
      router.refresh();
    } else {
      toast.success(res.message || "Invoice berhasil dibatalkan");
      router.refresh();
    }
  };

  const handleDownload = async (inv: Invoice) => {
    setDownloadingId(inv.id);
    await handleDownloadInvoicePdf(inv, company);
    setDownloadingId(null);
  };

  const filtered = invoicesList.filter((inv) => {
    const matchSearch =
      inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.invoiceNumber ?? "")
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "ALL" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const renderInvoiceActions = (inv: Invoice) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Aksi invoice ${inv.invoiceNumber || "draft"}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem>
          <Link href={`/invoices/${inv.id}`} className="flex w-full items-center">
            <Eye className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Lihat Detail
          </Link>
        </DropdownMenuItem>
        {role !== "STAFF" && inv.status !== "VOID" && inv.status !== "DRAFT" && (
          <DropdownMenuItem>
            <Link href={`/invoices/${inv.id}/edit`} className="flex w-full items-center">
              <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Edit Invoice
            </Link>
          </DropdownMenuItem>
        )}
        {inv.status !== "DRAFT" && (
          <DropdownMenuItem>
            <Link href={`/preview/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center">
              <FileText className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Lihat Invoice Digital
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handleDownload(inv)} disabled={downloadingId === inv.id} className="cursor-pointer">
          {downloadingId === inv.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5 text-muted-foreground" />}
          {downloadingId === inv.id ? "Menyiapkan PDF..." : "Download PDF"}
        </DropdownMenuItem>
        {role !== "STAFF" && (inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID" || inv.status === "OVERDUE") && (
          <DropdownMenuItem className="cursor-pointer" onClick={() => setSelectedPaymentInvoiceId(inv.id)}>
            <CreditCard className="mr-2 h-3.5 w-3.5" /> Catat Pembayaran
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {role === "OWNER" && inv.status !== "VOID" && inv.status !== "DRAFT" && inv.totalPaid === 0 && (
          <DropdownMenuItem className="cursor-pointer text-amber-600 focus:text-amber-600" onClick={() => setVoidingInvoice(inv)}>
            <Ban className="mr-2 h-3.5 w-3.5 text-amber-600" /> Batalkan Invoice
          </DropdownMenuItem>
        )}
        {role === "OWNER" && inv.status !== "VOID" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer font-medium text-red-600 focus:text-red-600" onClick={() => setDeletingInvoice(inv)}>
              <Trash2 className="mr-2 h-3.5 w-3.5 text-red-600" />
              {inv.status === "DRAFT" ? "Hapus Draft" : "Hapus Invoice"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section className="erp-surface overflow-hidden" aria-label="Daftar invoice">
      {/* Toolbar */}
      <div className="space-y-3 border-b border-border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nomor invoice atau restoran..."
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="h-10 w-full pl-9"
            />
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={`min-h-9 px-3.5 py-2 text-xs rounded-xl font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
              {f.value !== "ALL" && (
                <span className="ml-1.5 opacity-60">
                  {invoicesList.filter((i) => i.status === f.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Tidak ada invoice"
          description="Coba ubah filter atau kata kunci pencarian."
        />
      ) : (
        <>
        <div className="hidden overflow-x-auto lg:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold">Nomor Invoice</TableHead>
                <TableHead className="text-xs font-semibold">Restoran</TableHead>
                <TableHead className="text-xs font-semibold">Tanggal</TableHead>
                <TableHead className="text-xs font-semibold">Jatuh Tempo</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold text-right">Dibayar</TableHead>
                <TableHead className="text-xs font-semibold text-right">Sisa</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-muted/20">
                  <TableCell>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="text-sm font-mono font-medium text-foreground hover:underline"
                    >
                      {inv.invoiceNumber ?? (
                        <span className="text-muted-foreground italic text-xs">
                          Draft
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {inv.customerName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateShort(inv.issueDate)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.dueDate ? (
                      <span
                        className={
                          inv.status === "OVERDUE" ? "text-red-600 font-medium" : ""
                        }
                      >
                        {formatDateShort(inv.dueDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(inv.total)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {inv.totalPaid > 0 ? formatCurrency(inv.totalPaid) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {inv.status === "VOID" ? (
                      <span className="text-muted-foreground/40 font-mono">—</span>
                    ) : inv.remainingBalance > 0 ? (
                      <span
                        className={
                          inv.status === "OVERDUE"
                            ? "text-red-600 font-semibold"
                            : "font-medium"
                        }
                      >
                        {formatCurrency(inv.remainingBalance)}
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-medium">Lunas</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell>{renderInvoiceActions(inv)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="divide-y divide-border lg:hidden">
          {pageRows.map((inv) => (
            <article key={inv.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/invoices/${inv.id}`} className="block truncate font-mono text-sm font-semibold text-foreground hover:text-primary hover:underline">
                    {inv.invoiceNumber || "Draft"}
                  </Link>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{inv.customerName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <InvoiceStatusBadge status={inv.status} />
                  {renderInvoiceActions(inv)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-3 text-xs">
                <div className="min-w-0"><p className="text-muted-foreground">Total invoice</p><p className="mt-1 break-words font-bold text-foreground tabular-nums">{formatCurrency(inv.total)}</p></div>
                <div className="min-w-0 border-l border-border pl-3"><p className="text-muted-foreground">Sisa tagihan</p><p className={`mt-1 break-words font-bold tabular-nums ${inv.status === "OVERDUE" ? "text-red-600" : "text-foreground"}`}>{inv.status === "VOID" ? "—" : inv.remainingBalance > 0 ? formatCurrency(inv.remainingBalance) : "Lunas"}</p></div>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Terbit {formatDateShort(inv.issueDate)}</span><span>{inv.dueDate ? `Jatuh tempo ${formatDateShort(inv.dueDate)}` : "Tanpa jatuh tempo"}</span></div>
            </article>
          ))}
        </div>
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
        <p className="text-xs text-muted-foreground">
          {filtered.length} dari {invoicesList.length} invoice
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="px-2.5 sm:px-3" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Halaman sebelumnya">
            <ChevronLeft className="size-4 sm:mr-1" /><span className="hidden sm:inline">Sebelumnya</span>
          </Button>
          <span className="text-xs text-muted-foreground">{page}/{pageCount}</span>
          <Button variant="outline" size="sm" className="px-2.5 sm:px-3" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Halaman berikutnya">
            <span className="hidden sm:inline">Berikutnya</span><ChevronRight className="size-4 sm:ml-1" />
          </Button>
        </div>
      </div>

      {selectedPaymentInvoiceId && (
        <RecordPaymentDialog
          defaultInvoiceId={selectedPaymentInvoiceId}
          invoices={invoicesList}
          open={!!selectedPaymentInvoiceId}
          onOpenChange={(open) => {
            if (!open) setSelectedPaymentInvoiceId(null);
          }}
        />
      )}

      {deletingInvoice && (
        <ConfirmDialog
          open={!!deletingInvoice}
          onOpenChange={(open) => {
            if (!open) setDeletingInvoice(null);
          }}
          title="Hapus Draft Invoice?"
          description={`Draft "${deletingInvoice.invoiceNumber || deletingInvoice.id}" akan dihapus. Invoice yang sudah diterbitkan tidak dapat dihapus.`}
          confirmLabel="Hapus Draft"
          onConfirm={handleConfirmDeleteInvoice}
        />
      )}

      {voidingInvoice && (
        <ConfirmDialog
          open={!!voidingInvoice}
          onOpenChange={(open) => {
            if (!open) setVoidingInvoice(null);
          }}
          title="Batalkan Invoice?"
          description={`Apakah Anda yakin ingin membatalkan invoice "${voidingInvoice.invoiceNumber || voidingInvoice.id}"? Status invoice akan diubah menjadi Dibatalkan.`}
          confirmLabel="Batalkan Invoice"
          onConfirm={handleConfirmVoidInvoice}
        />
      )}
    </section>
  );
}
