"use client";

import { useState } from "react";
import { CalendarDays, FileText, Loader2, Plus, ReceiptText, Trash2, TrendingUp, Weight } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { createLoadAction } from "@/lib/actions/loads";
import { convertToKg, formatWeightKg, formatWeightTon, type WeightUnit } from "@/lib/domain/weights";
import { formatCurrency } from "@/lib/utils";
import type { Customer, Load, Product, Supplier } from "@/types";
import type { LoadCostInput, LoadItemInput, LoadInvoiceBasis } from "@/lib/domain/loads";
import { updateLoadAction } from "@/lib/actions/loads";

interface LoadFormProps { products: Product[]; suppliers: Supplier[]; customers: Customer[]; initialData?: Load; }
type Row = LoadItemInput & { id: string };
type CostRow = LoadCostInput & { id: string };
const today = () => new Date().toISOString().slice(0, 10);
const unitOptions: Array<{ value: WeightUnit; label: string }> = [{ value: "GRAM", label: "gram" }, { value: "KG", label: "kg" }, { value: "TON", label: "ton" }];

export function LoadForm({ products, suppliers, customers, initialData }: LoadFormProps) {
  const router = useRouter();
  const [loadDate, setLoadDate] = useState(initialData?.loadDate ?? today());
  const [destinationId, setDestinationId] = useState(initialData?.destinationId ?? "");
  const [invoiceBasis, setInvoiceBasis] = useState<LoadInvoiceBasis>(initialData?.invoiceBasis ?? "DEPARTURE");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() => initialData?.items.map((item, index) => ({
    id: `load-item-${item.id}-${index}`,
    sourceId: item.sourceId,
    productId: item.productId,
    quantity: item.inputQuantity,
    unit: item.inputUnit,
    purchasePricePerKg: item.purchasePricePerKg,
    sellingPricePerKg: item.sellingPricePerKg ?? 0,
    notes: item.notes,
  })) ?? []);
  const [costs, setCosts] = useState<CostRow[]>(() => initialData?.costs.map((cost, index) => ({ ...cost, id: `load-cost-${cost.id}-${index}`, category: cost.category as LoadCostInput["category"] })) ?? []);
  const [saving, setSaving] = useState(false);

  const activeProducts = products.filter((product) => product.status === "ACTIVE");
  const activeSources = suppliers.filter((supplier) => supplier.status === "ACTIVE");
  const activeBuyers = customers.filter((customer) => customer.status === "ACTIVE" && (customer.partnerType ?? "PABRIK") === "PABRIK");
  const totalKg = rows.reduce((total, row) => total + convertToKg(row.quantity, row.unit), 0);
  const purchaseTotal = rows.reduce((total, row) => total + convertToKg(row.quantity, row.unit) * row.purchasePricePerKg, 0);
  const invoiceTotal = rows.reduce((total, row) => total + convertToKg(row.quantity, row.unit) * (row.sellingPricePerKg ?? 0), 0);
  const costTotal = costs.reduce((total, cost) => total + cost.amount, 0);
  const estimatedProfit = invoiceTotal - purchaseTotal - costTotal;
  const estimatedMargin = invoiceTotal > 0 ? (estimatedProfit / invoiceTotal) * 100 : 0;

  const addRow = () => setRows((current) => [...current, { id: `load-item-${Date.now()}-${current.length}`, sourceId: "", productId: "", quantity: 1, unit: "KG", purchasePricePerKg: 0, sellingPricePerKg: 0 }]);
  const updateRow = (id: string, field: keyof Row, value: string | number) => setRows((current) => current.map((row) => {
    if (row.id !== id) return row;
    if (field === "purchasePricePerKg" && row.sellingPricePerKg === 0 && typeof value === "number" && value > 0) {
      return { ...row, purchasePricePerKg: value, sellingPricePerKg: value };
    }
    return { ...row, [field]: value };
  }));
  const chooseProduct = (id: string, productId: string) => {
    const product = activeProducts.find((entry) => entry.id === productId);
    setRows((current) => current.map((row) => row.id === id ? { ...row, productId, sellingPricePerKg: product?.defaultSellingPrice ?? row.sellingPricePerKg ?? 0 } : row));
  };
  const removeRow = (id: string) => setRows((current) => current.filter((row) => row.id !== id));
  const addCost = () => setCosts((current) => [...current, { id: `load-cost-${Date.now()}-${current.length}`, category: "OTHER", name: "", amount: 0 }]);
  const updateCost = (id: string, field: keyof CostRow, value: string | number) => setCosts((current) => current.map((cost) => cost.id === id ? { ...cost, [field]: value } : cost));
  const removeCost = (id: string) => setCosts((current) => current.filter((cost) => cost.id !== id));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const missingSellingPrice = rows.find((row) => !row.sellingPricePerKg || row.sellingPricePerKg <= 0);
    if (missingSellingPrice) {
      setSaving(false);
      toast.error("Isi harga jual pabrik per kg untuk setiap ikan sebelum membuat muatan.");
      return;
    }
    const payload = { loadDate, destinationId, invoiceBasis, notes: notes || undefined, items: rows.map((row) => ({ sourceId: row.sourceId, productId: row.productId, quantity: row.quantity, unit: row.unit, purchasePricePerKg: row.purchasePricePerKg, sellingPricePerKg: row.sellingPricePerKg, notes: row.notes })), costs: costs.map((cost) => ({ category: cost.category, name: cost.name, amount: cost.amount, notes: cost.notes })) };
    const result = initialData ? await updateLoadAction(initialData.id, payload) : await createLoadAction(payload);
    setSaving(false);
    if ("error" in result) { toast.error(`Gagal: ${result.error}`); return; }
    toast.success(result.message);
    router.push(`/loads/${initialData?.id ?? result.loadId}`);
    router.refresh();
  };

  return <form onSubmit={submit} className="flex flex-col items-start gap-6 xl:flex-row xl:gap-7">
    <div className="w-full min-w-0 flex-1 space-y-5">
    <section className="erp-surface space-y-4 p-5">
      <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Weight className="size-5" /></div><div><h2 className="text-sm font-semibold">Informasi muatan</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Satu muatan dikirim ke satu pabrik dan boleh mengambil barang dari banyak sumber.</p></div></div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5"><label htmlFor="load-date" className="text-xs font-semibold">Tanggal angkut</label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="load-date" type="date" required value={loadDate} onChange={(event) => setLoadDate(event.target.value)} className="h-10 rounded-xl pl-10" /></div></div>
        <div className="space-y-1.5"><label htmlFor="load-destination" className="text-xs font-semibold">Pabrik tujuan</label><select id="load-destination" required value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Pilih pabrik</option>{activeBuyers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="load-basis" className="text-xs font-semibold">Dasar invoice</label><select id="load-basis" value={invoiceBasis} onChange={(event) => setInvoiceBasis(event.target.value as LoadInvoiceBasis)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="DEPARTURE">Berat berangkat</option><option value="ACCEPTED">Berat diterima pabrik</option></select><p className="text-[11px] text-muted-foreground">Basis diterima membuat invoice awal berstatus estimasi.</p></div>
      </div>
    </section>

    <section className="erp-surface overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Barang per sumber</h2><p className="mt-1 text-xs text-muted-foreground">Masukkan berat asli. Total selalu dihitung dalam kilogram.</p></div><Button type="button" size="sm" variant="outline" onClick={addRow} className="rounded-xl"><Plus className="mr-1.5 size-4" />Tambah ikan</Button></div>
       {rows.length === 0 ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">Belum ada item. Tambahkan ikan dari TPI atau perorangan.</div> : <div className="divide-y divide-border">{rows.map((row, index) => <div key={row.id} className="grid gap-3 p-4 lg:grid-cols-[1.1fr_1.2fr_7rem_7rem_10rem_10rem_auto] lg:items-end">
        <div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Sumber {index + 1}</label><select required value={row.sourceId} onChange={(event) => updateRow(row.id, "sourceId", event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Pilih TPI / orang</option>{activeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></div>
         <div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Ikan</label><select required value={row.productId} onChange={(event) => chooseProduct(row.id, event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Pilih ikan</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.size ? ` [${product.size}]` : ""}</option>)}</select></div>
        <div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Berat</label><Input required min="0.001" step="0.001" type="number" value={row.quantity} onChange={(event) => updateRow(row.id, "quantity", Number(event.target.value))} className="h-10 rounded-xl text-right tabular-nums" /></div>
        <div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Satuan</label><select value={row.unit} onChange={(event) => updateRow(row.id, "unit", event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm">{unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></div>
         <div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Harga beli / kg</label><CurrencyInput required min={0.01} value={row.purchasePricePerKg} onChange={(value) => updateRow(row.id, "purchasePricePerKg", value)} /></div>
         <div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Harga jual pabrik / kg</label><CurrencyInput required min={0.01} value={row.sellingPricePerKg ?? 0} onChange={(value) => updateRow(row.id, "sellingPricePerKg", value)} placeholder="Contoh: 98000" /><p className="text-[10px] leading-4 text-muted-foreground">Jika belum diatur, mengikuti harga beli dan bisa diedit.</p></div>
        <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.id)} className="h-10 w-full rounded-xl text-muted-foreground hover:bg-red-50 hover:text-red-600 lg:w-10" aria-label={`Hapus item ${index + 1}`}><Trash2 className="size-4" /></Button>
      </div>)}</div>}
      <div className="flex flex-col gap-2 border-t border-border bg-muted/20 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-medium text-muted-foreground">Total muatan</span><span className="font-bold tabular-nums">{formatWeightKg(totalKg)} <span className="font-normal text-muted-foreground">({formatWeightTon(totalKg)})</span></span></div>
    </section>

    <section className="erp-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4"><div><h2 className="text-sm font-semibold">Biaya muatan</h2><p className="mt-1 text-xs text-muted-foreground">Es, pengiriman, dan biaya perjalanan tidak masuk hutang sumber.</p></div><Button type="button" size="sm" variant="outline" onClick={addCost} className="rounded-xl"><Plus className="mr-1.5 size-4" />Tambah biaya</Button></div>
      {costs.length > 0 && <div className="divide-y divide-border">{costs.map((cost) => <div key={cost.id} className="grid gap-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_10rem_auto] sm:items-end"><div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Kategori</label><select value={cost.category} onChange={(event) => updateCost(cost.id, "category", event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm"><option value="ICE">Es</option><option value="DELIVERY">Pengiriman</option><option value="FUEL">Bensin</option><option value="TOLL">Tol</option><option value="PARKING">Parkir</option><option value="LABOR">Tenaga kerja</option><option value="OTHER">Lainnya</option></select></div><div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Nama biaya</label><Input required value={cost.name} onChange={(event) => updateCost(cost.id, "name", event.target.value)} placeholder="Es balok" className="h-10 rounded-xl" /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold text-muted-foreground">Nominal</label><CurrencyInput required min={0.01} value={cost.amount} onChange={(value) => updateCost(cost.id, "amount", value)} /></div><Button type="button" variant="ghost" size="icon" onClick={() => removeCost(cost.id)} className="h-10 rounded-xl text-muted-foreground hover:text-red-600"><Trash2 className="size-4" /></Button></div>)}</div>}
      <div className="flex justify-between border-t border-border px-4 py-3 text-sm"><span className="text-muted-foreground">Total biaya muatan</span><span className="font-semibold tabular-nums">Rp {new Intl.NumberFormat("id-ID").format(costTotal)}</span></div>
    </section>

    <section className="erp-surface space-y-2 p-5"><label htmlFor="load-notes" className="text-xs font-semibold">Catatan muatan</label><textarea id="load-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Catatan timbang atau instruksi pabrik" /></section>
     <section className="flex flex-col gap-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm"><span className="text-muted-foreground">Total beli</span><strong>{formatCurrency(purchaseTotal)}</strong><span className="text-muted-foreground">Tujuan</span><strong>{activeBuyers.find((customer) => customer.id === destinationId)?.name ?? "Belum dipilih"}</strong></div><Button type="submit" disabled={saving || rows.length === 0 || !destinationId} className="rounded-xl">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}<FileText className="mr-2 size-4" />{initialData ? "Simpan perubahan" : "Buat muatan & invoice"}</Button></section>
    </div>

    <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-24 xl:w-80" aria-label="Ringkasan muatan dan margin">
      <section className="overflow-hidden rounded-[20px] border border-border/80 bg-white shadow-card">
        <div className="flex items-center gap-2.5 border-b border-border/70 px-5 py-4">
          <div className="flex size-8 items-center justify-center rounded-xl bg-accent text-accent-foreground"><ReceiptText className="size-4" /></div>
          <div>
            <h2 className="text-sm font-semibold tracking-[-0.01em]">Ringkasan muatan</h2>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Estimasi invoice pabrik</p>
          </div>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div className="space-y-2.5 rounded-xl bg-muted/55 p-3.5">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Pabrik tujuan</span><span className="max-w-[150px] truncate text-right font-medium">{activeBuyers.find((customer) => customer.id === destinationId)?.name ?? "Belum dipilih"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Total berat</span><span className="font-semibold tabular-nums">{formatWeightKg(totalKg)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Jumlah item</span><span className="font-semibold tabular-nums">{rows.length} ikan</span></div>
          </div>

          <div className="space-y-2.5 px-1">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Total beli ikan</span><span className="font-medium tabular-nums">{formatCurrency(purchaseTotal)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Biaya muatan</span><span className="font-medium tabular-nums">{formatCurrency(costTotal)}</span></div>
            <div className="flex justify-between gap-4 border-t border-border pt-2.5 font-semibold"><span>Pendapatan invoice</span><span className="tabular-nums">{formatCurrency(invoiceTotal)}</span></div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="mb-3 flex items-center justify-between gap-4 text-emerald-800"><span className="flex items-center gap-1.5 text-xs font-semibold"><TrendingUp className="size-3.5" /> Laba estimasi</span><span className="text-base font-bold tabular-nums">{formatCurrency(estimatedProfit)}</span></div>
            <div className="flex items-end justify-between gap-4"><p className="text-xs font-medium text-emerald-700">Margin</p><p className="text-3xl font-bold tracking-[-0.04em] text-emerald-800 tabular-nums">{estimatedMargin.toFixed(1)}%</p></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-200/70"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, estimatedMargin))}%` }} /></div>
            <p className="mt-3 text-[10px] leading-relaxed text-emerald-700/80">Margin dihitung dari harga jual pabrik dikurangi harga beli ikan dan biaya muatan.</p>
          </div>

          {!rows.length && <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">Tambahkan ikan untuk melihat estimasi margin.</p>}
        </div>
      </section>
    </aside>
   </form>;
}
