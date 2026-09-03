"use client";

import { useState } from "react";
import type { Payment, Invoice } from "@/types";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Eye, FileText, Download, CreditCard, Trash2 } from "lucide-react";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { deletePaymentAction, getPaymentProofUrlAction } from "@/lib/actions/payments";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface PaymentListTableProps {
  payments: Payment[];
  invoices: Invoice[];
}

export function PaymentListTable({ payments, invoices }: PaymentListTableProps) {
  const [selectedProof, setSelectedProof] = useState<{
    url: string;
    invoiceNumber: string;
    amount: number;
    isPdf: boolean;
  } | null>(null);

  const methodLabel: Record<string, string> = {
    CASH: "Tunai",
    TRANSFER: "Transfer",
    CHECK: "Cek",
    OTHER: "Lainnya",
  };

  const router = useRouter();
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingProofId, setLoadingProofId] = useState<string | null>(null);

  const handleDeletePayment = async () => {
    if (!deletingPayment) return;
    setDeleting(true);
    const res = await deletePaymentAction(deletingPayment.id);
    setDeleting(false);
    setDeletingPayment(null);
    if (res.error) {
      toast.error(`Gagal: ${res.error}`);
    } else {
      toast.success("Pembayaran berhasil dibatalkan.");
      router.refresh();
    }
  };

  const openProof = async (payment: Payment, invoiceNumber: string) => {
    if (!payment.proofPath) return;
    setLoadingProofId(payment.id);
    const result = await getPaymentProofUrlAction(payment.proofPath);
    setLoadingProofId(null);
    if (result.error || !result.url) {
      toast.error(result.error ?? "Bukti pembayaran tidak tersedia.");
      return;
    }
    setSelectedProof({
      url: result.url,
      invoiceNumber,
      amount: payment.amount,
      isPdf: payment.proofPath.toLowerCase().endsWith(".pdf"),
    });
  };

  return (
    <>
      <div className="erp-surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold">Riwayat Pembayaran</h3>
            <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">Catat dan lihat setiap penerimaan pembayaran.</p>
          </div>
          <RecordPaymentDialog invoices={invoices} />
        </div>
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold">Tanggal</TableHead>
                <TableHead className="text-xs font-semibold">Invoice</TableHead>
                <TableHead className="text-xs font-semibold">Metode</TableHead>
                <TableHead className="text-xs font-semibold">Bukti Transfer</TableHead>
                <TableHead className="text-xs font-semibold text-right">Nominal</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48">
                    <EmptyState
                      icon={CreditCard}
                      title="Tidak ada riwayat pembayaran"
                      description="Belum ada transaksi pembayaran yang tercatat untuk saat ini."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => {
                  const inv = invoices.find((i) => i.id === p.invoiceId);
                  const invNum = inv?.invoiceNumber || p.invoiceId;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/20">
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateShort(p.paymentDate)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-mono font-medium">
                            {invNum}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {inv?.customerName || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {methodLabel[p.method] ?? p.method}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.proofPath ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openProof(p, invNum)}
                            disabled={loadingProofId === p.id}
                            className="h-9 text-xs px-3 bg-blue-50/50 hover:bg-blue-100 text-blue-700 border-blue-200"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-blue-600" />
                            {loadingProofId === p.id ? "Membuka..." : "Lihat Bukti"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">— Tidak Ada —</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-600">
                        +{formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => setDeletingPayment(p)}
                          aria-label="Batalkan pembayaran"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="divide-y divide-border lg:hidden">
          {payments.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={CreditCard}
                title="Tidak ada riwayat pembayaran"
                description="Belum ada transaksi pembayaran yang tercatat untuk saat ini."
              />
            </div>
          ) : (
            payments.map((payment) => {
              const invoice = invoices.find((item) => item.id === payment.invoiceId);
              const invoiceNumber = invoice?.invoiceNumber || payment.invoiceId;
              return (
                <article key={payment.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-stone-900">{invoiceNumber}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{invoice?.customerName || "Pelanggan tidak tersedia"}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">+{formatCurrency(payment.amount)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Tanggal bayar</p>
                      <p className="mt-1 font-medium text-foreground">{formatDateShort(payment.paymentDate)}</p>
                    </div>
                    <div className="border-l border-border pl-3">
                      <p className="text-muted-foreground">Metode</p>
                      <p className="mt-1 font-medium text-foreground">{methodLabel[payment.method] ?? payment.method}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDeletingPayment(payment)}
                    aria-label="Batalkan pembayaran"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Batalkan
                  </button>
                  {payment.proofPath && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openProof(payment, invoiceNumber)}
                      disabled={loadingProofId === payment.id}
                      className="h-9 w-full rounded-xl border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      {loadingProofId === payment.id ? "Membuka..." : "Lihat Bukti Pembayaran"}
                    </Button>
                  )}
                </article>
              );
            })
          )}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {payments.length} transaksi pembayaran
          </p>
        </div>
      </div>

      {/* Proof Viewer Dialog */}
      <Dialog open={!!selectedProof} onOpenChange={(op) => !op && setSelectedProof(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bukti Pembayaran / Transfer</DialogTitle>
          </DialogHeader>

          {selectedProof && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between bg-muted/40 p-3 rounded-xl text-xs">
                <div>
                  <p className="text-muted-foreground">Nomor Invoice</p>
                  <p className="font-mono font-bold text-foreground">{selectedProof.invoiceNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">Nominal Pembayaran</p>
                  <p className="font-bold text-emerald-600">{formatCurrency(selectedProof.amount)}</p>
                </div>
              </div>

              <div className="border border-border rounded-xl p-2 bg-slate-950/5 min-h-[260px] max-h-[420px] flex items-center justify-center overflow-auto">
                {selectedProof.isPdf ? (
                  <div className="text-center p-6 space-y-3">
                    <FileText className="w-12 h-12 text-blue-600 mx-auto" />
                    <p className="text-xs text-muted-foreground">Dokumen PDF Bukti Pembayaran</p>
                    <a
                      href={selectedProof.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Unduh PDF
                    </a>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={selectedProof.url}
                    alt="Bukti Transfer"
                    className="max-h-[380px] w-auto object-contain rounded-lg shadow-sm"
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {deletingPayment && (
        <ConfirmDialog
          open={!!deletingPayment}
          onOpenChange={(open) => { if (!open) setDeletingPayment(null); }}
          title="Batalkan Pembayaran?"
          description={`Pembayaran sebesar ${formatCurrency(deletingPayment.amount)} akan dihapus dan sisa tagihan invoice akan diperbarui.`}
          confirmLabel={deleting ? "Membatalkan..." : "Ya, Batalkan"}
          onConfirm={handleDeletePayment}
        />
      )}
    </>
  );
}
