"use client";

import { useState, type ReactElement } from "react";
import { ClipboardPenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateStockSettingsAction } from "@/lib/actions/inventory";
import type { StockBalance } from "@/types";

export function AdjustStockDialog({ balance, trigger, open: controlledOpen, onOpenChange }: { balance?: StockBalance; trigger?: ReactElement; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [saving, setSaving] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [minimum, setMinimum] = useState("");
  const [notes, setNotes] = useState("");
  const reset = () => { setQuantity(balance ? String(balance.quantity) : ""); setMinimum(balance?.minimumQuantity ? String(balance.minimumQuantity) : "0"); setNotes(""); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Number(quantity) !== balance?.quantity && !notes.trim()) { toast.error("Alasan perubahan wajib diisi jika stok aktual berubah."); return; }
    const result = await updateStockSettingsAction({
      productId: balance?.productId ?? "",
      targetQuantity: Number(quantity),
      minimumQuantity: Number(minimum),
      notes,
    });
    if (result.error) { toast.error(`Gagal: ${result.error}`); return; }
    toast.success("Pengaturan stok berhasil disimpan."); setOpen(false); reset(); router.refresh();
  };
  if (!balance) return null;
  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) reset(); if (!next && !saving) reset(); }}>
    {controlledOpen === undefined && <DialogTrigger render={trigger ?? <Button variant="outline" size="sm" className="h-9 rounded-lg" />}>
      {!trigger && <><ClipboardPenLine className="mr-1.5 h-3.5 w-3.5" /> Sesuaikan</>}
    </DialogTrigger>}
    <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md">
      <DialogHeader><DialogTitle>Sesuaikan Stok</DialogTitle><DialogDescription>{balance.productName} · stok tercatat {balance.quantity} {balance.unit}. Isi jumlah fisik yang benar; sistem menghitung selisihnya otomatis.</DialogDescription></DialogHeader>
      <form onSubmit={async (event) => { setSaving(true); await submit(event); setSaving(false); }} className="space-y-4">
        <div className="space-y-1.5"><label htmlFor="stock-minimum-quantity" className="text-xs font-semibold text-stone-700">Batas minimum stok</label><Input id="stock-minimum-quantity" type="number" min="0" step="0.001" value={minimum} onChange={(event) => setMinimum(event.target.value)} required className="h-10 rounded-xl text-right tabular-nums" /></div>
        <div className="space-y-1.5"><label htmlFor="stock-adjustment-quantity" className="text-xs font-semibold text-stone-700">Stok aktual</label><Input id="stock-adjustment-quantity" type="number" min="0" step="0.001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Contoh: 15" className="h-10 rounded-xl text-right tabular-nums" /><p className="text-[11px] text-stone-500">Saldo setelah disimpan akan persis {quantity || "0"} {balance.unit}, bukan ditambahkan ke saldo lama.</p></div>
        {Number(quantity) !== balance.quantity && <div className="space-y-1.5"><label htmlFor="stock-adjustment-notes" className="text-xs font-semibold text-stone-700">Alasan perubahan</label><textarea id="stock-adjustment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} required className="min-h-24 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70" placeholder="Contoh: hasil stok opname fisik." /></div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Batal</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pengaturan</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
