"use client";

import { useState } from "react";
import { CalendarDays, FilePlus2, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSupplierBillAction } from "@/lib/actions/supplier-payables";
import { createStockReceiptAction } from "@/lib/actions/inventory";
import type { Supplier } from "@/types";
import type { ProductOption } from "@/lib/actions/products";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

interface AddSupplierBillDialogProps {
  suppliers: Supplier[];
  products: ProductOption[];
}

const today = () => new Date().toISOString().slice(0, 10);

export function AddSupplierBillDialog({ suppliers, products }: AddSupplierBillDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [total, setTotal] = useState(0);
  const [productId, setProductId] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setSupplierId("");
    setSupplierReference("");
    setBillDate(today());
    setDueDate("");
    setTotal(0);
    setProductId("");
    setStockQuantity("");
    setNotes("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const totalValue = Number(total);
    if (!supplierId || !Number.isFinite(totalValue) || totalValue <= 0) {
      toast.error("Pilih supplier dan isi total tagihan yang valid.");
      return;
    }
    const stockQuantityValue = Number(stockQuantity);
    if ((productId || stockQuantity) && (!productId || !Number.isFinite(stockQuantityValue) || stockQuantityValue <= 0)) {
      toast.error("Pilih produk dan isi jumlah stok yang valid.");
      return;
    }

    setSaving(true);
    const result = productId
      ? await createStockReceiptAction({
          supplierId,
          receivedDate: billDate,
          dueDate: dueDate || undefined,
          supplierReference: supplierReference || undefined,
          createPayable: true,
          notes: notes || undefined,
          items: [{ productId, quantity: stockQuantityValue, unitCost: totalValue / stockQuantityValue }],
        })
      : await createSupplierBillAction({
          supplierId,
          supplierReference: supplierReference || undefined,
          billDate,
          dueDate: dueDate || undefined,
          total: totalValue,
          notes: notes || undefined,
        });
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(`Gagal: ${result.error}`);
      return;
    }
    toast.success(productId ? "Hutang dan stok supplier berhasil dicatat." : "Tagihan supplier berhasil dicatat.");
    handleOpenChange(false);
    router.refresh();
  };

  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "ACTIVE");
  const activeProducts = products.filter((product) => product.status === "ACTIVE");
  const selectedProduct = activeProducts.find((product) => product.id === productId);
  const calculatedUnitCost = Number(stockQuantity) > 0 && Number(total) > 0 ? Number(total) / Number(stockQuantity) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} size="sm" className="h-10 rounded-xl px-4">
        <FilePlus2 className="mr-1.5 h-4 w-4" /> Catat Tagihan
      </Button>
      <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catat Hutang Supplier</DialogTitle>
          <DialogDescription>Masukkan tagihan pembelian. Jika produk dan jumlah stok diisi, stok akan bertambah otomatis dan terhubung dengan hutang supplier.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="supplier-payable-supplier" className="text-xs font-semibold text-stone-700">Supplier</label>
            <div className="relative">
              <Truck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <select
                id="supplier-payable-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
                className="h-10 w-full appearance-none rounded-xl border border-stone-200 bg-white px-10 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
              >
                <option value="">Pilih supplier</option>
                {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </div>
            {activeSuppliers.length === 0 && <p className="text-xs text-amber-700">Belum ada supplier aktif. Tambahkan supplier terlebih dahulu.</p>}
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5">
            <div className="mb-3"><p className="text-sm font-semibold text-sky-950">Produk dan stok masuk <span className="font-normal text-sky-800/70">(opsional)</span></p><p className="mt-0.5 text-xs text-sky-800/75">Isi bagian ini untuk menambahkan stok dari tagihan pembelian.</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><label htmlFor="supplier-payable-product" className="text-xs font-semibold text-sky-950">Produk</label><select id="supplier-payable-product" value={productId} onChange={(event) => setProductId(event.target.value)} className="h-10 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-sky-500 focus:ring-3 focus:ring-sky-200/70"><option value="">Tidak terkait stok</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.size ? ` [${product.size}]` : ""}</option>)}</select></div>
              {productId && <div className="space-y-1.5"><label htmlFor="supplier-payable-stock" className="text-xs font-semibold text-sky-950">Jumlah stok ({selectedProduct?.defaultUnit || "kg"})</label><Input id="supplier-payable-stock" type="number" min="0.001" step="0.001" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} required className="h-10 rounded-xl border-sky-200 bg-white text-right tabular-nums" placeholder="Contoh: 25" /></div>}
              {productId && <div className="flex items-end"><p className="w-full rounded-xl border border-dashed border-sky-200 bg-white/70 px-3 py-2.5 text-xs text-sky-900">HPP otomatis: <span className="font-semibold tabular-nums">{formatCurrency(calculatedUnitCost)}/{selectedProduct?.defaultUnit || "unit"}</span></p></div>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="supplier-payable-total" className="text-xs font-semibold text-stone-700">Total Tagihan (Rp)</label>
              <CurrencyInput id="supplier-payable-total" value={total} onChange={setTotal} className="h-10 rounded-xl border-stone-200" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="supplier-payable-reference" className="text-xs font-semibold text-stone-700">No. Tagihan Supplier</label>
              <Input id="supplier-payable-reference" value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} className="h-10 rounded-xl border-stone-200" placeholder="Opsional" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="supplier-payable-date" className="text-xs font-semibold text-stone-700">Tanggal Tagihan</label>
              <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><Input id="supplier-payable-date" type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} required className="h-10 rounded-xl border-stone-200 pl-10" /></div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="supplier-payable-due-date" className="text-xs font-semibold text-stone-700">Jatuh Tempo</label>
              <Input id="supplier-payable-due-date" type="date" min={billDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-xl border-stone-200" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="supplier-payable-notes" className="text-xs font-semibold text-stone-700">Catatan</label>
            <textarea id="supplier-payable-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70" placeholder="Contoh: pembelian udang vaname minggu pertama." />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving || activeSuppliers.length === 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Tagihan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
