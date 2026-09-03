"use client";

import { useState } from "react";
import { Edit2, Loader2, Plus, Search, Tag, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCustomerPriceAction, deleteCustomerPriceAction } from "@/lib/actions/pricing";
import { formatCurrency } from "@/lib/utils";
import type { Customer, Product } from "@/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

export interface CustomPriceRecord {
  id: string;
  customerId: string;
  productId: string;
  sellingPrice: number;
  effectiveAt: string;
}

interface SellingPriceTableProps {
  products: Product[];
  customers: Customer[];
  customPrices: CustomPriceRecord[];
}

interface ActivePrice {
  customer: Customer;
  product: Product;
  record?: CustomPriceRecord;
}

export function SellingPriceTable({ products, customers, customPrices }: SellingPriceTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ActivePrice | null>(null);
  const [priceInput, setPriceInput] = useState(0);
  const [deletingRecord, setDeletingRecord] = useState<{ id: string; customerName: string; productName: string } | null>(null);

  const priceMap = new Map<string, CustomPriceRecord>();
  for (const price of customPrices) priceMap.set(`${price.customerId}_${price.productId}`, price);

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query) || (product.size ?? "").toLowerCase().includes(query);
  });

  const openPriceEditor = (customer: Customer, product: Product, record?: CustomPriceRecord) => {
    setActiveItem({ customer, product, record });
    setPriceInput(record?.sellingPrice ?? product.defaultSellingPrice ?? 0);
  };

  const savePrice = async () => {
    if (!activeItem || priceInput <= 0) {
      toast.error("Masukkan harga jual khusus yang valid.");
      return;
    }
    const key = `${activeItem.customer.id}_${activeItem.product.id}`;
    setLoadingKey(key);
    const result = await createCustomerPriceAction({
      customerId: activeItem.customer.id,
      productId: activeItem.product.id,
      sellingPrice: priceInput,
    });
    setLoadingKey(null);
    if (result.error) {
      toast.error(`Gagal: ${result.error}`);
      return;
    }
    toast.success(result.message || "Harga khusus berhasil disimpan.");
    setActiveItem(null);
    router.refresh();
  };

  const deletePrice = async () => {
    if (!deletingRecord) return;
    setLoadingKey(deletingRecord.id);
    const result = await deleteCustomerPriceAction(deletingRecord.id);
    setLoadingKey(null);
    if (result.error) {
      toast.error(`Gagal menghapus: ${result.error}`);
      return;
    }
    toast.success(result.message || "Harga khusus berhasil dihapus.");
    setDeletingRecord(null);
    router.refresh();
  };

  const priceCell = (customer: Customer, product: Product) => {
    const key = `${customer.id}_${product.id}`;
    const record = priceMap.get(key);
    const loading = loadingKey === key || loadingKey === record?.id;
    if (loading) return <Loader2 className="ml-auto size-4 animate-spin text-stone-400" />;
    if (!record) {
      return <button type="button" onClick={() => openPriceEditor(customer, product)} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"><Plus className="size-3.5" /> Atur harga</button>;
    }
    return <div className="flex items-center justify-end gap-1.5"><span className="font-semibold tabular-nums text-emerald-700">{formatCurrency(record.sellingPrice)}</span><button type="button" onClick={() => openPriceEditor(customer, product, record)} className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-900" aria-label={`Edit harga ${product.name} untuk ${customer.name}`}><Edit2 className="size-3.5" /></button><button type="button" onClick={() => setDeletingRecord({ id: record.id, customerName: customer.name, productName: product.name })} className="rounded-md p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-700" aria-label={`Hapus harga ${product.name} untuk ${customer.name}`}><Trash2 className="size-3.5" /></button></div>;
  };

  return <>
    <section className="erp-surface overflow-hidden">
      <header className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Tag className="size-4" /></div>
        <div><h2 className="text-sm font-semibold text-stone-900">Harga jual produk</h2><p className="mt-0.5 text-xs text-stone-500">Harga default berlaku umum. Harga khusus hanya berlaku untuk restoran yang dipilih.</p></div>
      </header>
      <div className="flex flex-col gap-3 border-b border-stone-200 bg-stone-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk, kategori, atau ukuran" aria-label="Cari produk harga jual" className="h-10 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70" /></div>
        <div className="flex items-center gap-2 text-xs text-stone-500"><Users className="size-4" /> {customers.length} restoran · {filteredProducts.length} produk</div>
      </div>

      {customers.length === 0 || filteredProducts.length === 0 ? <div className="py-14"><EmptyState icon={Tag} title={filteredProducts.length === 0 ? "Produk tidak ditemukan" : "Belum ada restoran"} description={filteredProducts.length === 0 ? "Coba ubah kata kunci pencarian." : "Tambahkan restoran terlebih dahulu untuk mengatur harga khusus."} /></div> : <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-stone-200 bg-stone-50/80"><th className="sticky left-0 z-10 min-w-[240px] bg-stone-50/95 px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">Produk</th><th className="min-w-[145px] px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">Harga default</th>{customers.map((customer) => <th key={customer.id} className="min-w-[170px] px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500"><span className="block truncate normal-case text-sm text-stone-700">{customer.name}</span><span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-stone-400">Harga khusus</span></th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100">{filteredProducts.map((product) => <tr key={product.id} className="hover:bg-stone-50/60"><td className="sticky left-0 z-10 bg-white px-5 py-3"><p className="font-semibold text-stone-900">{product.name}</p><p className="mt-1 text-xs text-stone-500">{product.category}{product.size ? ` · ${product.size}` : ""} · per {product.defaultUnit}</p></td><td className="px-3 py-3 text-right font-semibold tabular-nums text-stone-900">{product.defaultSellingPrice ? formatCurrency(product.defaultSellingPrice) : "—"}</td>{customers.map((customer) => <td key={customer.id} className="px-3 py-3 text-right">{priceCell(customer, product)}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="divide-y divide-stone-100 md:hidden">{filteredProducts.map((product) => <article key={product.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-stone-900">{product.name}</p><p className="mt-1 text-xs text-stone-500">{product.category}{product.size ? ` · ${product.size}` : ""} · per {product.defaultUnit}</p></div><div className="shrink-0 text-right"><p className="text-[10px] text-stone-500">Default</p><p className="text-sm font-bold tabular-nums text-stone-900">{product.defaultSellingPrice ? formatCurrency(product.defaultSellingPrice) : "—"}</p></div></div><div className="rounded-xl bg-stone-50 px-3 py-1">{customers.map((customer) => <div key={customer.id} className="flex items-center justify-between gap-3 border-b border-stone-200/70 py-2 last:border-b-0"><span className="min-w-0 truncate text-xs font-medium text-stone-700">{customer.name}</span><div className="shrink-0">{priceCell(customer, product)}</div></div>)}</div></article>)}</div>
      </>}
    </section>

    {activeItem && <Dialog open onOpenChange={(open) => !open && setActiveItem(null)}><DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Atur harga khusus restoran</DialogTitle></DialogHeader><div className="space-y-4 py-2"><div className="rounded-xl bg-stone-50 px-3 py-2.5"><p className="text-xs text-stone-500">Restoran</p><p className="mt-1 text-sm font-semibold text-stone-900">{activeItem.customer.name}</p><p className="mt-3 text-xs text-stone-500">Produk</p><p className="mt-1 text-sm font-semibold text-stone-900">{activeItem.product.name}</p></div><div><p className="text-xs text-stone-500">Harga jual default</p><p className="mt-1 text-sm font-semibold text-stone-900">{activeItem.product.defaultSellingPrice ? `${formatCurrency(activeItem.product.defaultSellingPrice)} / ${activeItem.product.defaultUnit}` : "Belum diatur"}</p></div><div className="space-y-1.5"><label htmlFor="selling-price-input" className="text-xs font-semibold text-stone-700">Harga khusus per {activeItem.product.defaultUnit}</label><CurrencyInput id="selling-price-input" value={priceInput} onChange={setPriceInput} /></div></div><DialogFooter><Button variant="outline" onClick={() => setActiveItem(null)}>Batal</Button><Button onClick={savePrice} disabled={!!loadingKey}>{loadingKey && <Loader2 className="mr-2 size-4 animate-spin" />}Simpan harga</Button></DialogFooter></DialogContent></Dialog>}
    {deletingRecord && <ConfirmDialog open onOpenChange={(open) => !open && setDeletingRecord(null)} title="Hapus harga khusus?" description={`Harga khusus ${deletingRecord.productName} untuk ${deletingRecord.customerName} akan dihapus dan kembali ke harga default.`} confirmLabel="Hapus harga" onConfirm={deletePrice} />}
  </>;
}
