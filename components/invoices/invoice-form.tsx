"use client";

import { useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  Eye,
  FileText,
  Loader2,
  Lock,
  PackageOpen,
  PencilLine,
  Plus,
  ReceiptText,
  Scale,
  Save,
  Send,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatCurrency,
  calculateInvoice,
  formatPercent,
  getDirectCostLabel,
  formatQuantity,
  getBillingQuantity,
} from "@/lib/utils";
import type { CustomerPrice, DirectCostCategory } from "@/types";
import { createInvoiceAction, updateInvoiceAction } from "@/lib/actions/invoices";
import { useRouter } from "next/navigation";

import type { Customer, Product } from "@/types";

interface InvoiceItemRow {
  id: string;
  productId: string;
  description: string;
  quantity: number;
  marginQuantity: number;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
}

interface DirectCostRow {
  id: string;
  category: DirectCostCategory;
  name: string;
  amount: number;
  notes: string;
}

const DIRECT_COST_CATEGORIES: DirectCostCategory[] = [
  "PACKAGING",
  "ICE",
  "SHIPPING",
  "FUEL",
  "TOLL",
  "PARKING",
  "COURIER",
  "PRODUCT_LOSS",
  "OTHER",
];

interface InitialInvoiceData {
  id: string;
  customerId: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  discount: number;
  items: Array<{
    productId: string;
    description: string;
    quantity: number;
    marginQuantity?: number;
    unit: string;
    sellingPrice: number;
    purchasePrice: number;
  }>;
  costs: Array<{
    category: string;
    name: string;
    amount: number;
    notes?: string;
  }>;
}

interface InvoiceFormProps {
  customers?: Customer[];
  products?: Product[];
  customerPrices?: CustomerPrice[];
  canViewInternal?: boolean;
  initialData?: InitialInvoiceData;
}

export function InvoiceForm({ customers = [], products = [], customerPrices = [], canViewInternal = false, initialData }: InvoiceFormProps) {
  const customersList = customers;
  const productsList = products;

  const [customerId, setCustomerId] = useState(initialData?.customerId ?? "");
  const [issueDate, setIssueDate] = useState(initialData?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initialData?.dueDate ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [discount, setDiscount] = useState(initialData?.discount ?? 0);

  const [items, setItems] = useState<InvoiceItemRow[]>(() => {
    if (initialData?.items?.length) {
      return initialData.items.map((item, i) => ({
        id: `item_${Date.now()}_${i}`,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        marginQuantity: item.marginQuantity ?? 0,
        unit: item.unit,
        sellingPrice: item.sellingPrice,
        purchasePrice: item.purchasePrice,
      }));
    }
    return [{
      id: `item_${Date.now()}`,
      productId: "",
      description: "",
      quantity: 1,
      marginQuantity: 0,
      unit: "",
      sellingPrice: 0,
      purchasePrice: 0,
    }];
  });
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [marginDrafts, setMarginDrafts] = useState<Record<string, string>>({});
  const [marginEditors, setMarginEditors] = useState<Record<string, boolean>>({});
  const [costs, setCosts] = useState<DirectCostRow[]>(() => {
    if (initialData?.costs?.length) {
      return initialData.costs.map((cost, i) => ({
        id: `cost_${Date.now()}_${i}`,
        category: cost.category as DirectCostCategory,
        name: cost.name,
        amount: cost.amount,
        notes: cost.notes ?? "",
      }));
    }
    return [];
  });

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [formError, setFormError] = useState("");

  const selectedCustomer = customersList.find((c) => c.id === customerId);

  const calculateDueDate = (dateValue: string, paymentTermDays: number) => {
    const date = new Date(`${dateValue}T00:00:00`);
    date.setDate(date.getDate() + paymentTermDays);
    return date.toISOString().slice(0, 10);
  };

  // Add item
  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        productId: "",
        description: "",
        quantity: 1,
        marginQuantity: 0,
        unit: "kg",
        sellingPrice: 0,
        purchasePrice: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMarginDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateItem = (
    id: string,
    field: keyof InvoiceItemRow,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "productId") {
          const product = productsList.find((p) => p.id === value);
          if (product) {
            return {
              ...item,
              productId: value as string,
              description: product.size ? `${product.name} (${product.size})` : product.name,
              unit: product.defaultUnit,
              sellingPrice: customerPrices.find((price) => price.customerId === customerId && price.productId === product.id)?.sellingPrice ?? product.defaultSellingPrice ?? 0,
              purchasePrice: canViewInternal ? product.activeCost ?? 0 : 0,
            };
          }
        }
        return { ...item, [field]: value };
      })
    );
  };

  const updateQuantity = (id: string, rawValue: string) => {
    setQuantityDrafts((prev) => ({ ...prev, [id]: rawValue }));
    const normalized = rawValue.replace(",", ".");
    if (normalized === "" || normalized === ".") {
      updateItem(id, "quantity", 0);
      return;
    }

    const quantity = Number(normalized);
    if (Number.isFinite(quantity) && quantity >= 0) {
      updateItem(id, "quantity", quantity);
    }
  };

  const commitQuantity = (item: InvoiceItemRow) => {
    const rawValue = quantityDrafts[item.id];
    if (rawValue === undefined) return;

    const quantity = Number(rawValue.replace(",", "."));
    const nextQuantity = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
    updateItem(item.id, "quantity", nextQuantity);
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const updateMargin = (id: string, rawValue: string) => {
    const normalized = rawValue.replace(",", ".");
    setMarginDrafts((prev) => ({ ...prev, [id]: rawValue }));
    if (normalized === "" || normalized === "." || normalized === "0.") {
      updateItem(id, "marginQuantity", normalized === "0." ? 0 : 0);
      return;
    }
    const margin = Number(normalized);
    if (Number.isFinite(margin) && margin >= 0) updateItem(id, "marginQuantity", margin);
  };

  const commitMargin = (item: InvoiceItemRow) => {
    const rawValue = marginDrafts[item.id];
    if (rawValue === undefined) return;
    const margin = Number(rawValue.replace(",", "."));
    updateItem(item.id, "marginQuantity", Number.isFinite(margin) && margin >= 0 ? Number(margin.toFixed(3)) : 0);
    setMarginDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  // Add cost
  const addCost = () => {
    setCosts((prev) => [
      ...prev,
      {
        id: `cost_${Date.now()}`,
        category: "PACKAGING",
        name: "",
        amount: 0,
        notes: "",
      },
    ]);
  };

  const removeCost = (id: string) => {
    setCosts((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCost = (
    id: string,
    field: keyof DirectCostRow,
    value: string | number
  ) => {
    setCosts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  // Calculations
  const calc = calculateInvoice(
    items.map((i) => ({
      quantity: i.quantity,
      billingQuantity: i.quantity + i.marginQuantity,
      purchaseQuantity: i.quantity,
      sellingPrice: i.sellingPrice,
      purchasePrice: i.purchasePrice,
    })),
    costs.map((c) => ({ amount: c.amount })),
    discount
  );
  const marginProgress = Math.min(100, Math.max(0, calc.transactionMargin));

  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const submitInvoice = async (status: "DRAFT" | "ISSUED") => {
    setFormError("");
    if (!customerId) {
      setFormError("Pilih restoran pelanggan terlebih dahulu.");
      return false;
    }
    if (items.length === 0) {
      setFormError("Tambahkan minimal 1 item produk ke dalam invoice.");
      return false;
    }

    setSubmitting(true);
    const toastId = toast.loading(
      status === "ISSUED"
        ? "Sedang menerbitkan invoice ke database..."
        : "Sedang menyimpan draft invoice..."
    );

    const res = await createInvoiceAction({
      customerId,
      issueDate,
      dueDate,
      notes,
      discount: canViewInternal ? discount : 0,
      status,
      items: items.map((i) => ({
        productId: i.productId,
        description: i.description,
        quantity: i.quantity,
        marginQuantity: i.marginQuantity,
        unit: i.unit,
        sellingPrice: i.sellingPrice,
        purchasePrice: i.purchasePrice,
      })),
      costs: canViewInternal ? costs.map((c) => ({
        category: c.category,
        name: c.name,
        amount: c.amount,
        notes: c.notes,
      })) : [],
    });

    setSubmitting(false);
    toast.dismiss(toastId);

    if (res.error) {
      setFormError(res.error);
      toast.error(`Gagal: ${res.error}`);
      return false;
    } else if ("success" in res && res.success) {
      toast.success(
        status === "ISSUED" ? "Invoice berhasil diterbitkan!" : "Draft invoice berhasil disimpan!"
      );
      setPublishDialogOpen(false);
      const invoiceId = res.invoiceId;
      router.push(`/invoices/${invoiceId}`);
      return true;
    }

    return false;
  };

  const updateInvoice = async () => {
    setFormError("");
    if (!initialData?.id) return false;
    if (items.length === 0) {
      setFormError("Tambahkan minimal 1 item produk ke dalam invoice.");
      return false;
    }
    setSubmitting(true);
    const toastId = toast.loading("Sedang memperbarui invoice...");
    const res = await updateInvoiceAction(initialData.id, {
      dueDate,
      notes,
      discount: canViewInternal ? discount : 0,
      items: items.map((i) => ({
        productId: i.productId,
        description: i.description,
        quantity: i.quantity,
        marginQuantity: i.marginQuantity,
        unit: i.unit,
        sellingPrice: i.sellingPrice,
        purchasePrice: i.purchasePrice,
      })),
      costs: canViewInternal ? costs.map((c) => ({
        category: c.category,
        name: c.name,
        amount: c.amount,
        notes: c.notes,
      })) : [],
    });
    setSubmitting(false);
    toast.dismiss(toastId);
    if (res.error) {
      setFormError(res.error);
      toast.error(`Gagal: ${res.error}`);
      return false;
    }
    toast.success("Invoice berhasil diperbarui!");
    router.push(`/invoices/${initialData.id}`);
    router.refresh();
    return true;
  };

  const handleSaveDraft = async () => {
    setSaveState("saving");
    const saved = await submitInvoice("DRAFT");
    setSaveState(saved ? "saved" : "idle");
    if (saved) setTimeout(() => setSaveState("idle"), 2000);
  };

  const handlePublish = async () => {
    await submitInvoice("ISSUED");
  };

  return (
    <div className="flex flex-col items-start gap-6 xl:flex-row xl:gap-7">
      {/* Left Panel — Main Form */}
      <div className="w-full min-w-0 flex-1 space-y-5">
        {formError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}
        {/* Customer info */}
        <section className="rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_30px_rgba(15,23,42,0.035)] sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
              <UserRound className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                Informasi Pelanggan
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tentukan restoran dan periode pembayaran invoice.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-2 block text-xs font-semibold text-stone-600">
                Restoran <span className="text-red-500">*</span>
              </label>
              <Select value={customerId} disabled={!!initialData} onValueChange={(value) => {
                const nextCustomerId = value || "";
                setCustomerId(nextCustomerId);
                const customer = customersList.find((item) => item.id === nextCustomerId);
                if (customer) setDueDate(calculateDueDate(issueDate, customer.paymentTermDays));
              }}>
                <SelectTrigger className="h-10 w-full rounded-xl border-stone-200 bg-stone-50/60 px-3 hover:bg-stone-50">
                  <SelectValue placeholder="Pilih restoran...">
                    {selectedCustomer ? selectedCustomer.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customersList
                    .filter((c) => c.status === "ACTIVE" || (!!initialData && c.id === initialData.customerId))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCustomer && (
              <div className="grid gap-3 rounded-xl border border-stone-200/80 bg-stone-50/70 p-3.5 sm:col-span-2 sm:grid-cols-[0.8fr_1.6fr_auto]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Kontak</p>
                  <p className="mt-1 text-xs font-medium text-stone-700">{selectedCustomer.contactName || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Alamat Tagihan</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{selectedCustomer.billingAddress || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Termin</p>
                  <p className="mt-1 text-xs font-semibold text-stone-700">{selectedCustomer.paymentTermDays} hari</p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                <CalendarDays className="size-3.5 text-stone-400" />
                Tanggal Invoice
              </label>
              <Input
                type="date"
                value={issueDate}
                onChange={(event) => {
                  setIssueDate(event.target.value);
                  if (selectedCustomer) setDueDate(calculateDueDate(event.target.value, selectedCustomer.paymentTermDays));
                }}
                className="h-10 rounded-xl border-stone-200 bg-stone-50/60 px-3"
              />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                <CalendarDays className="size-3.5 text-stone-400" />
                Jatuh Tempo
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10 rounded-xl border-stone-200 bg-stone-50/60 px-3"
              />
            </div>
          </div>
         </section>

         {/* Items table */}
        <section className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_30px_rgba(15,23,42,0.035)]">
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                <PackageOpen className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Item Produk</h2>
                  {items.length > 0 && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                      {items.length} item
                    </span>
                  )}
                </div>
             <p className="mt-0.5 truncate text-xs text-muted-foreground">HPP otomatis memakai rata-rata harga stok. Gunakan tombol timbangan untuk margin tagihan.</p>
              </div>
            </div>
            <Button onClick={addItem} size="sm" variant="outline" className="h-10 rounded-xl bg-white px-4 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              Tambah Item
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
              <div className="mb-3 flex size-11 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-stone-400">
                <PackageOpen className="size-5" />
              </div>
              <p className="text-sm font-medium text-stone-700">Belum ada produk</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Tambahkan produk yang dipesan restoran untuk mulai menghitung invoice.</p>
              <Button onClick={addItem} size="sm" variant="outline" className="mt-4 h-10 rounded-xl">
                <Plus className="size-3.5" /> Tambah produk pertama
              </Button>
            </div>
          ) : (
            <div className="erp-table-wrap hidden md:block">
              <table className="erp-table min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/80">
                    <th className="min-w-[180px] px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Produk
                    </th>
                    <th className="w-24 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Size
                    </th>
                    <th className="w-28 px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Qty
                    </th>
                    <th className="w-20 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Satuan
                    </th>
                    {canViewInternal && <th className="w-32 bg-amber-50/70 px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                      <span className="inline-flex items-center justify-end gap-1">
                        <PencilLine className="w-3 h-3 text-amber-600" /> HPP Rata-rata Stok
                      </span>
                    </th>}
                    <th className="w-32 px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Harga Jual
                    </th>
                    <th className="w-32 px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                       Subtotal
                     </th>
                     <th className="w-36 px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-stone-50/60">
                      <td className="px-5 py-3">
                        <Select
                          value={item.productId}
                          onValueChange={(v) =>
                            updateItem(item.id, "productId", v || "")
                          }
                        >
                          <SelectTrigger className="h-9 w-full rounded-xl border-stone-200 bg-white text-xs">
                            <SelectValue placeholder="Pilih produk...">
                              {(() => {
                                const p = productsList.find((prod) => prod.id === item.productId);
                                return p ? p.name : undefined;
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {productsList
                              .filter((p) => p.status === "ACTIVE")
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} {p.size ? `[${p.size}]` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {(() => {
                          const p = productsList.find((prod) => prod.id === item.productId);
                          return p?.size ? (
                            <span className="inline-block rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 font-semibold text-sky-700">
                              {p.size}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quantityDrafts[item.id] ?? String(item.quantity)}
                          onChange={(event) => updateQuantity(item.id, event.target.value)}
                          onBlur={() => commitQuantity(item)}
                          onFocus={(event) => event.currentTarget.select()}
                          aria-label={`Jumlah ${item.description || "produk"}`}
                          className="h-10 min-w-[5.5rem] w-full rounded-xl border border-stone-200 bg-white px-3 text-center text-sm font-semibold tabular-nums text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          value={item.unit}
                          readOnly
                          className="h-9 w-full rounded-xl border-stone-200 bg-stone-50 text-xs"
                        />
                      </td>
                      {canViewInternal && <td className="bg-amber-50/40 px-3 py-3">
                        <CurrencyInput
                          value={item.purchasePrice}
                          onChange={(val) => updateItem(item.id, "purchasePrice", val)}
                          aria-label={`HPP rata-rata stok ${item.description || "produk"}`}
                          className="min-w-[8rem] border-amber-300 text-amber-900"
                        />
                        {(() => {
                          const product = productsList.find((entry) => entry.id === item.productId);
                          return product?.activeCost ? <p className="mt-1 text-[10px] text-amber-700/80">Rata-rata stok: {formatCurrency(product.activeCost)}</p> : <p className="mt-1 text-[10px] text-amber-700/80">Belum ada harga stok</p>;
                        })()}
                      </td>}
                      <td className="px-3 py-3">
                        <CurrencyInput
                          value={item.sellingPrice}
                          onChange={(val) => updateItem(item.id, "sellingPrice", val)}
                          aria-label={`Harga jual invoice ${item.description || "produk"}`}
                          className="min-w-[8rem] border-stone-300"
                        />
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-stone-800">
                        <p>{formatCurrency(getBillingQuantity(item.quantity, item.marginQuantity) * item.sellingPrice)}</p>
                        {item.marginQuantity > 0 && <p className="mt-1 text-[10px] font-medium text-sky-700">Tagih {formatQuantity(getBillingQuantity(item.quantity, item.marginQuantity))} {item.unit}</p>}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                           <button type="button" onClick={() => setMarginEditors((current) => ({ ...current, [item.id]: !current[item.id] }))} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${item.marginQuantity > 0 ? "border-sky-200 bg-sky-50 text-sky-700" : "border-transparent text-muted-foreground hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"}`} aria-label={`Atur margin ${item.description || "produk"}`} aria-expanded={!!marginEditors[item.id]} title="Atur margin tagihan"><Scale className="size-3.5" /><span>Timbangan</span></button>
                          <button type="button" onClick={() => removeItem(item.id)} className="flex size-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600" aria-label="Hapus item"><Trash2 className="size-3.5" /></button>
                        </div>
                         {marginEditors[item.id] && <div className="mt-2 w-32"><label className="sr-only" htmlFor={`margin-${item.id}`}>Margin tagihan dalam {item.unit}</label><input id={`margin-${item.id}`} type="text" inputMode="decimal" value={marginDrafts[item.id] ?? (item.marginQuantity > 0 ? String(item.marginQuantity) : "")} onChange={(event) => updateMargin(item.id, event.target.value)} onBlur={() => commitMargin(item)} placeholder="Qty margin" className="h-8 w-full rounded-lg border border-sky-200 bg-sky-50 px-2 text-right text-xs tabular-nums text-sky-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" /><p className="mt-1 text-[9px] leading-tight text-sky-700">Tambah tagihan, stok tetap.</p></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length > 0 && (
            <div className="divide-y divide-stone-100 md:hidden">
              {items.map((item, index) => {
                const selectedProduct = productsList.find((product) => product.id === item.productId);
                return (
                  <div key={item.id} className="space-y-4 px-4 py-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Item {index + 1}</span>
                      <div className="flex items-center gap-1"><button type="button" onClick={() => setMarginEditors((current) => ({ ...current, [item.id]: !current[item.id] }))} className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${item.marginQuantity > 0 ? "border-sky-200 bg-sky-50 text-sky-700" : "border-transparent text-muted-foreground hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"}`} aria-label={`Atur margin item ${index + 1}`} aria-expanded={!!marginEditors[item.id]}><Scale className="size-3.5" /> Timbangan</button><button type="button" onClick={() => removeItem(item.id)} className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600" aria-label={`Hapus item ${index + 1}`}><Trash2 className="size-3.5" /> Hapus</button></div>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-stone-600">Produk</label>
                      <Select value={item.productId} onValueChange={(value) => updateItem(item.id, "productId", value || "")}>
                        <SelectTrigger className="h-10 w-full rounded-xl border-stone-200 bg-stone-50/60 text-xs">
                          <SelectValue placeholder="Pilih produk...">{selectedProduct?.name}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {productsList.filter((product) => product.status === "ACTIVE").map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} {product.size ? `[${product.size}]` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-stone-600">Jumlah</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quantityDrafts[item.id] ?? String(item.quantity)}
                          onChange={(event) => updateQuantity(item.id, event.target.value)}
                          onBlur={() => commitQuantity(item)}
                          onFocus={(event) => event.currentTarget.select()}
                          aria-label={`Jumlah ${item.description || "produk"}`}
                          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-center text-sm font-semibold tabular-nums text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-stone-600">Satuan</label>
                        <Input value={item.unit} readOnly className="h-10 rounded-xl border-stone-200 bg-stone-50 text-sm" />
                      </div>
                    </div>
                    <div className={canViewInternal ? "grid grid-cols-1 gap-3 min-[430px]:grid-cols-2" : "grid grid-cols-1"}>
                      {canViewInternal && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <label className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-700"><PencilLine className="size-3" /> HPP Rata-rata Stok</label>
                          <CurrencyInput
                            value={item.purchasePrice}
                            onChange={(val) => updateItem(item.id, "purchasePrice", val)}
                            aria-label={`HPP rata-rata stok ${item.description || "produk"}`}
                            className="border-amber-300 text-amber-900"
                          />
                          <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700/80">Otomatis dari rata-rata harga stok{selectedProduct?.activeCost ? `: ${formatCurrency(selectedProduct.activeCost)}` : ""}. Bisa diubah khusus invoice ini.</p>
                        </div>
                      )}
                      <div className="rounded-xl border border-stone-200 bg-white p-3">
                        <label className="mb-2 block text-xs font-semibold text-stone-500">Harga Jual</label>
                        <CurrencyInput
                          value={item.sellingPrice}
                          onChange={(val) => updateItem(item.id, "sellingPrice", val)}
                          aria-label={`Harga jual invoice ${item.description || "produk"}`}
                          className="border-stone-300"
                        />
                        <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">Khusus invoice ini. Harga default tetap.</p>
                      </div>
                    </div>
                      {marginEditors[item.id] && <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3"><label htmlFor={`margin-mobile-${item.id}`} className="mb-2 flex items-center gap-1 text-xs font-semibold text-sky-700"><Scale className="size-3" /> Margin tagihan ({item.unit})</label><input id={`margin-mobile-${item.id}`} type="text" inputMode="decimal" value={marginDrafts[item.id] ?? (item.marginQuantity > 0 ? String(item.marginQuantity) : "")} onChange={(event) => updateMargin(item.id, event.target.value)} onBlur={() => commitMargin(item)} placeholder="Contoh: 0.5" className="h-10 w-full rounded-xl border border-sky-200 bg-white px-3 text-right text-sm font-semibold tabular-nums text-sky-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" /><p className="mt-1.5 text-[10px] leading-relaxed text-sky-700/80">Margin menambah qty tagihan, tetapi tidak mengurangi stok.</p></div>}
                     <div className="flex items-end justify-between border-t border-dashed border-stone-200 pt-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Ukuran</p>
                        <p className="mt-1 text-xs font-medium text-stone-600">{selectedProduct?.size || "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Subtotal</p>
                         <p className="mt-1 text-base font-bold tabular-nums text-stone-900">{formatCurrency(getBillingQuantity(item.quantity, item.marginQuantity) * item.sellingPrice)}</p>
                         {item.marginQuantity > 0 && <p className="mt-1 text-[10px] font-medium text-sky-700">Tagih {formatQuantity(getBillingQuantity(item.quantity, item.marginQuantity))} {item.unit}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discount row */}
          {items.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-stone-200 bg-stone-50/50 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
              {canViewInternal && <div className="flex items-center justify-between gap-3 sm:justify-start">
                <label className="whitespace-nowrap text-xs font-semibold text-stone-600">
                  Diskon (Rp)
                </label>
                <CurrencyInput
                  value={discount}
                  onChange={(val) => setDiscount(val)}
                  className="w-40 h-9 border-stone-200"
                />
              </div>}
              <div className="flex items-end justify-between gap-6 text-right sm:block">
                <p className="text-xs font-medium text-muted-foreground">Total setelah diskon</p>
                <p className="text-lg font-bold tracking-[-0.02em] tabular-nums text-stone-900">
                  {formatCurrency(calc.revenue)}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Internal costs panel */}
        {canViewInternal && <section className="overflow-hidden rounded-[20px] border border-amber-200/80 bg-white shadow-[0_1px_2px_rgba(120,53,15,0.03),0_12px_30px_rgba(120,53,15,0.035)]">
          <div className="flex items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50/60 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-100/70 text-amber-700">
                <WalletCards className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-[-0.01em] text-amber-950">Biaya Internal</h2>
                  <span className="hidden rounded-full border border-amber-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
                    Privat
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-amber-700/75">Tidak tampil pada invoice pelanggan.</p>
              </div>
            </div>
            <Button
              onClick={addCost}
              size="sm"
              variant="outline"
              className="h-10 rounded-xl border-amber-300 bg-white/70 px-3.5 text-xs text-amber-800 shadow-sm hover:bg-white"
            >
              <Plus className="size-3.5" />
              Tambah Biaya
            </Button>
          </div>

          {costs.length === 0 ? (
            <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
              <div>
                <p className="text-sm font-medium text-stone-700">Belum ada biaya tambahan</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Tambahkan packaging, pengiriman, bahan bakar, atau biaya transaksi lain bila ada.</p>
              </div>
              <Button onClick={addCost} size="sm" variant="ghost" className="hidden shrink-0 rounded-xl text-amber-700 hover:bg-amber-50 sm:inline-flex">
                <Plus className="size-3.5" /> Tambah
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {costs.map((cost) => (
                <div key={cost.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[144px_minmax(0,1fr)_144px_32px] sm:items-end sm:px-6">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-400 sm:hidden">Kategori</label>
                    <Select value={cost.category} onValueChange={(value) => updateCost(cost.id, "category", value as DirectCostCategory)}>
                      <SelectTrigger className="h-9 w-full rounded-xl border-stone-200 text-xs">
                        <SelectValue>{getDirectCostLabel(cost.category)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DIRECT_COST_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>{getDirectCostLabel(category)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-400 sm:hidden">Keterangan</label>
                    <Input
                      placeholder="Contoh: Box styrofoam"
                      value={cost.name}
                      onChange={(event) => updateCost(cost.id, "name", event.target.value)}
                      className="h-9 rounded-xl border-stone-200 text-xs"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-400 sm:hidden">Nominal</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-stone-400">Rp</span>
                      <Input
                        type="number"
                        min={0}
                        value={cost.amount}
                        onChange={(event) => updateCost(cost.id, "amount", parseFloat(event.target.value) || 0)}
                        className="h-9 rounded-xl border-stone-200 pl-8 text-right text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <button type="button" onClick={() => removeCost(cost.id)} className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600" aria-label="Hapus biaya">
                    <Trash2 className="size-3.5" /><span className="sm:hidden">Hapus biaya</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>}

        {/* Notes */}
        <section className="rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_30px_rgba(15,23,42,0.035)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700"><FileText className="size-4" /></div>
            <div>
              <label htmlFor="invoice-notes" className="block text-sm font-semibold tracking-[-0.01em] text-foreground">Catatan Invoice</label>
              <p className="mt-0.5 text-xs text-muted-foreground">Informasi ini akan terlihat oleh pelanggan.</p>
            </div>
          </div>
          <textarea
            id="invoice-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Mohon periksa jumlah dan kualitas produk saat pesanan diterima."
            rows={3}
            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/60 px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-3 focus:ring-stone-900/10"
          />
        </section>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 rounded-[18px] border border-black/[0.06] bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          {initialData ? (
            // ── Edit mode ──────────────────────────────────────────────
            <>
              <Button
                variant="ghost"
                size="lg"
                className="w-full rounded-xl text-stone-600 sm:w-auto"
                onClick={() => router.push(`/invoices/${initialData.id}`)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                size="lg"
                className="w-full rounded-xl px-6 shadow-sm sm:w-auto"
                onClick={updateInvoice}
                disabled={submitting || items.length === 0}
              >
                {submitting ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Menyimpan...</>
                ) : (
                  <><Save className="size-4" /> Simpan Perubahan</>
                )}
              </Button>
            </>
          ) : (
            // ── Create mode ─────────────────────────────────────────────
            <>
              <Button
                variant="ghost"
                onClick={handleSaveDraft}
                disabled={submitting || saveState === "saving"}
                size="lg"
                className="w-full rounded-xl text-stone-600 sm:w-auto"
              >
                {saveState === "saving" ? (
                  <><Loader2 className="size-4 animate-spin" /> Menyimpan...</>
                ) : saveState === "saved" ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Tersimpan
                  </span>
                ) : (
                  <><Save className="size-4" /> Simpan Draft</>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full rounded-xl bg-white sm:w-auto"
                onClick={() => setPreviewDialogOpen(true)}
                disabled={submitting || !customerId || items.length === 0}
              >
                <Eye className="size-4" /> Preview
              </Button>
              {canViewInternal && <Button
                disabled={submitting || saveState === "saving"}
                onClick={() => {
                  if (!customerId || items.length === 0) {
                    submitInvoice("ISSUED");
                  } else {
                    setPublishDialogOpen(true);
                  }
                }}
                size="lg"
                className="w-full rounded-xl px-4 shadow-sm sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <><Send className="size-4" /> Terbitkan Invoice</>
                )}
              </Button>}
            </>
          )}
        </div>
      </div>

      {/* Right Panel — Internal Summary (sticky on lg) */}
      {canViewInternal && <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-24 xl:w-80">
        <div className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_36px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-stone-100 text-stone-700"><ReceiptText className="size-4" /></div>
              <div>
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-stone-900">Ringkasan Internal</h2>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">Analisis transaksi</p>
              </div>
            </div>
            <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700"><Lock className="size-3" /> Privat</span>
          </div>

          <div className="space-y-4 p-5 text-sm">
            <div className="space-y-2.5 rounded-xl bg-stone-50 p-3.5">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal Produk</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(calc.subtotal)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Diskon</span>
                  <span className="font-medium text-red-600 tabular-nums">
                    -{formatCurrency(discount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-stone-200 pt-2.5 font-semibold">
                <span className="text-stone-800">Pendapatan</span>
                <span className="tabular-nums text-stone-900">
                  {formatCurrency(calc.revenue)}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 px-1">
              <div className="flex justify-between gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  HPP Produk
                  <Lock className="w-3 h-3 text-amber-500" />
                </span>
                <span className="tabular-nums">
                  {formatCurrency(calc.totalProductCost)}
                </span>
              </div>

              {costs.length > 0 && (
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    Biaya Internal
                    <Lock className="w-3 h-3 text-amber-500" />
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(calc.totalDirectCost)}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-4 text-emerald-800">
                <span className="text-xs font-semibold">Laba Transaksi</span>
                <span className="text-base font-bold tracking-[-0.02em] tabular-nums">
                  {formatCurrency(calc.transactionProfit)}
                </span>
              </div>
              <div className="flex items-end justify-between gap-4">
                <p className="text-xs font-medium text-emerald-700">Margin</p>
                <p className="text-3xl font-bold tracking-[-0.04em] text-emerald-800 tabular-nums">
                  {formatPercent(calc.transactionMargin)}
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-200/70">
                <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${marginProgress}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-[10px] text-emerald-700/80">
                <span>Laba produk</span>
                <span className="font-semibold tabular-nums">{formatCurrency(calc.productProfit)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Validation warnings */}
        {items.length > 0 &&
          items.some((i) => i.purchasePrice === 0) && (
            <div className="flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <AlertCircle className="mt-0.5 size-4 flex-shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                Beberapa item belum memiliki harga beli. Harga beli diperlukan
                untuk menerbitkan invoice.
              </p>
            </div>
          )}
      </aside>}

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview Invoice</DialogTitle>
            <DialogDescription>Pratinjau ini memakai harga database. Nilai final tetap dihitung ulang secara aman saat disimpan.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border p-4 space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Restoran</span><span className="font-semibold">{selectedCustomer?.name}</span></div>
            <div className="divide-y">
              {items.map((item) => <div key={item.id} className="py-2 flex justify-between gap-4"><span>{item.description} x {formatQuantity(getBillingQuantity(item.quantity, item.marginQuantity))} {item.unit}</span><span className="font-medium">{formatCurrency(getBillingQuantity(item.quantity, item.marginQuantity) * item.sellingPrice)}</span></div>)}
            </div>
            <div className="border-t pt-3 flex justify-between text-base font-bold"><span>Total</span><span>{formatCurrency(calc.revenue)}</span></div>
          </div>
          <DialogFooter><Button onClick={() => setPreviewDialogOpen(false)}>Tutup Preview</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish confirmation dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={(op) => !submitting && setPublishDialogOpen(op)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Terbitkan Invoice?</DialogTitle>
            <DialogDescription>
              Invoice yang diterbitkan akan menyimpan snapshot harga dan tidak
              dapat diedit bebas. Koreksi hanya dapat dilakukan melalui
              pembatalan atau invoice pengganti.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Restoran</span>
              <span className="font-medium">
                {selectedCustomer?.name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{formatCurrency(calc.revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jumlah item</span>
              <span>{items.length} produk</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setPublishDialogOpen(false)}
            >
              Batal
            </Button>
            <Button onClick={handlePublish} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Menerbitkan Invoice...
                </>
              ) : (
                "Terbitkan Invoice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
