"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BanknoteArrowUp, CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { createSupplierPaymentAction, type SupplierPayable } from "@/lib/actions/supplier-payables";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@/types";
import Link from "next/link";
import type { ReportPeriod } from "@/lib/report-period";
import type { SortDirection } from "@/lib/report-sort";
import { getSortHref } from "@/lib/report-sort";

interface SupplierPayablesTableProps {
  bills: SupplierPayable[];
  period: ReportPeriod;
  sort: string;
  direction: SortDirection;
}

const statusStyle: Record<SupplierPayable["status"], string> = {
  OPEN: "border-sky-200 bg-sky-50 text-sky-700",
  PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-700",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  OVERDUE: "border-red-200 bg-red-50 text-red-700",
  VOID: "border-stone-200 bg-stone-100 text-stone-600",
};
const statusLabel: Record<SupplierPayable["status"], string> = { OPEN: "Belum Dibayar", PARTIALLY_PAID: "Sebagian", PAID: "Lunas", OVERDUE: "Jatuh Tempo", VOID: "Dibatalkan" };
const today = () => new Date().toISOString().slice(0, 10);

function SupplierPayablesSortLink({ label, sortKey, period, sort, direction }: { label: string; sortKey: string; period: ReportPeriod; sort: string; direction: SortDirection }) {
  const Icon = sort === sortKey ? (direction === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  const href = getSortHref("/reports/supplier-payables", period, sortKey, sort, direction);
  return <Link href={href} className="inline-flex items-center gap-1.5 rounded-md py-1 text-inherit transition-colors hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"><span>{label}</span><Icon className={`size-3 ${sort === sortKey ? "text-stone-900" : "text-stone-400"}`} /><span className="sr-only">Urutkan berdasarkan {label}</span></Link>;
}

export function SupplierPayablesTable({ bills, period, sort, direction }: SupplierPayablesTableProps) {
  const router = useRouter();
  const [selectedBill, setSelectedBill] = useState<SupplierPayable | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const openPayment = (bill: SupplierPayable) => {
    setSelectedBill(bill);
    setAmount(String(bill.remainingBalance));
    setPaymentDate(today());
    setMethod("TRANSFER");
    setReferenceNumber("");
    setNotes("");
  };
  const closePayment = () => { if (!saving) setSelectedBill(null); };
  const submitPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBill) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { toast.error("Masukkan nominal pembayaran yang valid."); return; }
    setSaving(true);
    const result = await createSupplierPaymentAction({ supplierBillId: selectedBill.id, amount: parsedAmount, paymentDate, method, referenceNumber: referenceNumber || undefined, notes: notes || undefined });
    setSaving(false);
    if (result.error) { toast.error(`Gagal: ${result.error}`); return; }
    toast.success(result.message || "Pembayaran supplier berhasil dicatat.");
    setSelectedBill(null);
    router.refresh();
  };

  return (
    <>
      <div className="erp-surface overflow-hidden">
        <div className="erp-table-wrap hidden lg:block">
          <table className="erp-table min-w-[780px] w-full text-sm">
             <thead><tr className="border-b border-stone-200 bg-stone-50/80"><th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500"><SupplierPayablesSortLink label="Tagihan" sortKey="billNumber" period={period} sort={sort} direction={direction} /></th><th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500"><SupplierPayablesSortLink label="Supplier" sortKey="supplier" period={period} sort={sort} direction={direction} /></th><th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500"><SupplierPayablesSortLink label="Jatuh Tempo" sortKey="dueDate" period={period} sort={sort} direction={direction} /></th><th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500"><SupplierPayablesSortLink label="Total" sortKey="total" period={period} sort={sort} direction={direction} /></th><th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500"><SupplierPayablesSortLink label="Sisa" sortKey="remaining" period={period} sort={sort} direction={direction} /></th><th className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500"><SupplierPayablesSortLink label="Status" sortKey="status" period={period} sort={sort} direction={direction} /></th><th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">Aksi</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {bills.length === 0 ? <tr><td colSpan={7} className="h-52"><EmptyState icon={Landmark} title="Belum ada hutang supplier" description="Catat tagihan pembelian dari supplier untuk memantau kewajiban pembayaran." /></td></tr> : bills.map((bill) => (
                <tr key={bill.id} className="hover:bg-stone-50/60"><td className="px-5 py-3"><p className="font-mono text-xs font-semibold text-stone-900">{bill.billNumber}</p>{bill.supplierReference && <p className="mt-1 text-xs text-muted-foreground">Ref: {bill.supplierReference}</p>}</td><td className="px-3 py-3"><p className="font-medium text-stone-900">{bill.supplierName}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateShort(bill.billDate)}</p></td><td className={`px-3 py-3 text-xs ${bill.status === "OVERDUE" ? "font-semibold text-red-600" : "text-muted-foreground"}`}>{bill.dueDate ? formatDateShort(bill.dueDate) : "—"}</td><td className="px-3 py-3 text-right text-xs tabular-nums text-stone-700">{formatCurrency(bill.total)}</td><td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-red-600">{formatCurrency(bill.remainingBalance)}</td><td className="px-3 py-3 text-center"><Badge variant="outline" className={statusStyle[bill.status]}>{statusLabel[bill.status]}</Badge></td><td className="px-5 py-3 text-right">{bill.remainingBalance > 0 && bill.status !== "VOID" && <Button size="sm" variant="outline" onClick={() => openPayment(bill)} className="h-8 rounded-lg border-stone-200 text-xs"><BanknoteArrowUp className="mr-1.5 h-3.5 w-3.5" /> Bayar</Button>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border lg:hidden">
          {bills.length === 0 ? <div className="py-12"><EmptyState icon={Landmark} title="Belum ada hutang supplier" description="Catat tagihan pembelian dari supplier untuk memantau kewajiban pembayaran." /></div> : bills.map((bill) => (
            <article key={bill.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-mono text-sm font-semibold text-stone-900">{bill.billNumber}</p><p className="mt-1 truncate text-xs text-muted-foreground">{bill.supplierName}</p></div><Badge variant="outline" className={`shrink-0 ${statusStyle[bill.status]}`}>{statusLabel[bill.status]}</Badge></div><div className="flex items-end justify-between rounded-xl bg-stone-50 p-3"><div><p className="text-[11px] text-stone-500">Sisa hutang</p><p className="mt-1 text-base font-bold tabular-nums text-red-600">{formatCurrency(bill.remainingBalance)}</p></div><div className="text-right text-xs"><p className="text-stone-500">Jatuh tempo</p><p className={`mt-1 font-medium ${bill.status === "OVERDUE" ? "text-red-600" : "text-stone-800"}`}>{bill.dueDate ? formatDateShort(bill.dueDate) : "—"}</p></div></div><div className="flex items-center justify-between text-xs"><span className="text-stone-500">Total {formatCurrency(bill.total)}</span><span className="text-emerald-700">Dibayar {formatCurrency(bill.totalPaid)}</span></div>{bill.remainingBalance > 0 && bill.status !== "VOID" && <Button variant="outline" size="sm" onClick={() => openPayment(bill)} className="h-10 w-full rounded-xl"><BanknoteArrowUp className="mr-1.5 h-4 w-4" /> Catat Pembayaran</Button>}</article>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedBill} onOpenChange={(open) => !open && closePayment()}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Bayar Tagihan Supplier</DialogTitle><DialogDescription>{selectedBill ? `${selectedBill.supplierName} · ${selectedBill.billNumber}` : ""}</DialogDescription></DialogHeader>{selectedBill && <form onSubmit={submitPayment} className="space-y-4"><div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"><div className="flex items-center justify-between"><span className="text-stone-500">Sisa tagihan</span><span className="font-bold tabular-nums text-red-600">{formatCurrency(selectedBill.remainingBalance)}</span></div></div><div className="space-y-1.5"><label htmlFor="supplier-payment-amount" className="text-xs font-semibold text-stone-700">Nominal Pembayaran (Rp)</label><Input id="supplier-payment-amount" type="number" min="0" max={selectedBill.remainingBalance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="h-10 rounded-xl text-right tabular-nums" /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="supplier-payment-date" className="text-xs font-semibold text-stone-700">Tanggal</label><Input id="supplier-payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required className="h-10 rounded-xl" /></div><div className="space-y-1.5"><label htmlFor="supplier-payment-method" className="text-xs font-semibold text-stone-700">Metode</label><select id="supplier-payment-method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-500"><option value="TRANSFER">Transfer</option><option value="CASH">Tunai</option><option value="CHECK">Cek</option><option value="OTHER">Lainnya</option></select></div></div><div className="space-y-1.5"><label htmlFor="supplier-payment-reference" className="text-xs font-semibold text-stone-700">Referensi Pembayaran</label><Input id="supplier-payment-reference" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} className="h-10 rounded-xl" placeholder="No. transfer (opsional)" /></div><DialogFooter><Button type="button" variant="outline" onClick={closePayment} disabled={saving}>Batal</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Simpan Pembayaran</Button></DialogFooter></form>}</DialogContent>
      </Dialog>
    </>
  );
}
