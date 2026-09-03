"use client";

import { useState, type ReactElement } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { adjustProductAverageCostAction } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StockBalance } from "@/types";

export function AdjustProductCostDialog({ balance, trigger, controlledOpen, onOpenChange }: { balance: StockBalance; trigger?: ReactElement; controlledOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [newCost, setNewCost] = useState(balance.averageUnitCost);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setNewCost(balance.averageUnitCost); setReason(""); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) { toast.error("Alasan penyesuaian HPP wajib diisi."); return; }
    setSaving(true);
    const result = await adjustProductAverageCostAction(balance.productId, newCost, reason);
    setSaving(false);
    if ("error" in result && result.error) { toast.error(`Gagal: ${result.error}`); return; }
    toast.success("message" in result ? result.message : "HPP berhasil disesuaikan.");
    setOpen(false);
    reset();
    router.refresh();
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (!next) reset(); } }}>
    {controlledOpen === undefined && <DialogTrigger render={trigger ?? <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg"><Calculator className="mr-1.5 size-3.5" /> Sesuaikan HPP</Button>} />}
    <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Sesuaikan HPP rata-rata</DialogTitle>
        <DialogDescription>{balance.productName}. Penyesuaian ini tidak mengubah kuantitas, batch, atau harga supplier. Gunakan hanya untuk koreksi nilai HPP yang memiliki alasan jelas.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm"><span className="text-stone-500">HPP saat ini</span><span className="float-right font-semibold tabular-nums text-stone-900">{balance.averageUnitCost > 0 ? `Rp ${new Intl.NumberFormat("id-ID").format(balance.averageUnitCost)}` : "Belum tersedia"}/{balance.unit}</span></div>
        <div className="space-y-1.5"><label htmlFor={`new-cost-${balance.productId}`} className="text-xs font-semibold text-stone-700">HPP baru per {balance.unit}</label><CurrencyInput id={`new-cost-${balance.productId}`} value={newCost} onChange={setNewCost} placeholder="85000" /></div>
        <div className="space-y-1.5"><label htmlFor={`cost-reason-${balance.productId}`} className="text-xs font-semibold text-stone-700">Alasan penyesuaian</label><Input id={`cost-reason-${balance.productId}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: koreksi HPP pembukaan setelah verifikasi stok" required /></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Perubahan dicatat sebagai koreksi HPP. Harga beli supplier dan batch pembelian tetap menjadi histori transaksi asli.</div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Batal</Button><Button type="submit" disabled={saving || newCost <= 0}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Simpan koreksi HPP</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
