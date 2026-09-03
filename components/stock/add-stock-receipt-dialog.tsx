"use client";

import { useState } from "react";
import { CalendarDays, FilePlus2, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createStockReceiptAction } from "@/lib/actions/inventory";
import type { Product, Supplier } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ReceiptRow { id: string; productId: string; quantity: string; unitCost: number; }
interface AddStockReceiptDialogProps { products: Product[]; suppliers: Supplier[]; }
const today = () => new Date().toISOString().slice(0, 10);

export function AddStockReceiptDialog({ products, suppliers }: AddStockReceiptDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [createPayable, setCreatePayable] = useState(true);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReceiptRow[]>([]);

  const reset = () => {
    setSupplierId(""); setReceivedDate(today()); setDueDate(""); setSupplierReference("");
    setCreatePayable(true); setNotes(""); setItems([]);
  };
  const handleOpenChange = (nextOpen: boolean) => { setOpen(nextOpen); if (!nextOpen && !saving) reset(); };
  const addItem = () => setItems((current) => [...current, { id: `receipt_${Date.now()}_${current.length}`, productId: "", quantity: "1", unitCost: 0 }]);
  const removeItem = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const updateItem = (id: string, field: keyof ReceiptRow, value: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const chooseProduct = (id: string, productId: string) => {
    const product = products.find((item) => item.id === productId);
    setItems((current) => current.map((item) => item.id === id ? { ...item, productId, unitCost: product?.activeCost || item.unitCost } : item));
  };

  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * item.unitCost, 0);
  const activeProducts = products.filter((product) => product.status === "ACTIVE");
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "ACTIVE");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await createStockReceiptAction({
      supplierId, receivedDate, dueDate: createPayable && dueDate ? dueDate : undefined,
      supplierReference: supplierReference || undefined, createPayable, notes: notes || undefined,
       items: items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), unitCost: item.unitCost })),
    });
    if (result.error) { toast.error(`Gagal: ${result.error}`); return; }
    setSaving(false); toast.success("message" in result ? result.message : "Penerimaan stok berhasil dicatat."); handleOpenChange(false); router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} size="sm" className="h-10 rounded-xl px-4"><FilePlus2 className="mr-1.5 h-4 w-4" /> Barang Masuk</Button>
      <DialogContent className="max-h-[min(92dvh,820px)] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Catat Barang Masuk</DialogTitle>
          <DialogDescription>Pilih supplier, masukkan produk yang diterima, dan tentukan apakah totalnya menjadi hutang supplier.</DialogDescription>
        </DialogHeader>
        <form onSubmit={async (event) => { setSaving(true); await submit(event); setSaving(false); }} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="stock-receipt-supplier" className="text-xs font-semibold text-stone-700">Supplier</label>
              <div className="relative"><Truck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <select id="stock-receipt-supplier" required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-stone-200 bg-white px-10 text-sm outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"><option value="">Pilih supplier</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
              </div>
            </div>
            <div className="space-y-1.5"><label htmlFor="stock-receipt-date" className="text-xs font-semibold text-stone-700">Tanggal penerimaan</label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><Input id="stock-receipt-date" type="date" required value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} className="h-10 rounded-xl pl-10" /></div></div>
            <div className="space-y-1.5"><label htmlFor="stock-receipt-reference" className="text-xs font-semibold text-stone-700">No. referensi supplier</label><Input id="stock-receipt-reference" value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} placeholder="Opsional" className="h-10 rounded-xl" /></div>
          </div>

          <div className="overflow-hidden rounded-xl border border-stone-200">
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-3 py-3"><div><p className="text-sm font-semibold text-stone-800">Produk diterima</p><p className="text-xs text-stone-500">Harga supplier akan digabung ke HPP rata-rata berdasarkan jumlah stok.</p></div><Button type="button" size="sm" variant="outline" onClick={addItem} className="h-10 rounded-xl px-3.5"><Plus className="mr-1 h-3.5 w-3.5" /> Tambah</Button></div>
             {items.length === 0 ? <div className="px-4 py-8 text-center text-xs text-stone-500">Belum ada produk. Tambahkan minimal satu produk.</div> : <div className="divide-y divide-stone-100">{items.map((item, index) => { const product = products.find((entry) => entry.id === item.productId); return <div key={item.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] sm:items-end"><div className="space-y-1.5"><label className="text-[11px] font-semibold text-stone-600">Produk {index + 1}</label><select required value={item.productId} onChange={(event) => chooseProduct(item.id, event.target.value)} className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-500"><option value="">Pilih produk</option>{activeProducts.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.size ? ` [${entry.size}]` : ""}</option>)}</select>{product && <p className="text-[11px] text-stone-500">Satuan: {product.defaultUnit} · stok saat ini {product.stockQuantity ?? 0}</p>}</div><div className="space-y-1.5"><label className="text-[11px] font-semibold text-stone-600">Jumlah</label><Input required min="0.001" step="0.001" type="number" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} className="h-10 rounded-xl text-right tabular-nums" /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold text-stone-600">Harga beli</label><CurrencyInput required min={0.01} value={item.unitCost} onChange={(value) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, unitCost: value } : entry))} placeholder="85000" /></div><Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-10 w-full rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600 sm:w-10" aria-label={`Hapus produk ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div>; })}</div>}
            <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-3 py-3 text-sm"><span className="font-medium text-stone-600">Total pembelian</span><span className="font-bold tabular-nums text-stone-900">{formatCurrency(total)}</span></div>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5"><label className="flex items-start gap-2.5 text-sm text-sky-950"><input type="checkbox" checked={createPayable} onChange={(event) => setCreatePayable(event.target.checked)} className="mt-0.5 size-4 accent-sky-700" /><span><span className="font-semibold">Buat hutang supplier dari penerimaan ini</span><span className="mt-0.5 block text-xs text-sky-800/75">Jika dicentang, total pembelian muncul di laporan Hutang Supplier.</span></span></label>{createPayable && <div className="mt-3 max-w-xs space-y-1.5"><label htmlFor="stock-receipt-due" className="text-xs font-semibold text-sky-900">Jatuh tempo</label><Input id="stock-receipt-due" type="date" min={receivedDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-xl border-sky-200 bg-white" /></div>}</div>
          <div className="space-y-1.5"><label htmlFor="stock-receipt-notes" className="text-xs font-semibold text-stone-700">Catatan</label><textarea id="stock-receipt-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70" placeholder="Contoh: pembelian udang vaname dari supplier pagi ini." /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Batal</Button><Button type="submit" disabled={saving || !supplierId || items.length === 0 || activeSuppliers.length === 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Penerimaan</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
