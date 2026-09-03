"use client";

import { useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine, ArrowUpDown, Boxes, History, PackageSearch } from "lucide-react";
import { StockRowActions } from "@/components/stock/stock-row-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getStockMovementLabel } from "@/lib/domain/inventory";
import { formatCurrency, formatDatetime, formatNumber } from "@/lib/utils";
import type { Product, StockBalance, StockBatch, StockMovement } from "@/types";

interface StockTableProps {
  balances: StockBalance[];
  movements: StockMovement[];
  batches?: StockBatch[];
  products?: Product[];
  view?: "balances" | "movements" | "all";
}

type StockSortKey = "productName" | "category" | "size" | "quantity" | "averageUnitCost" | "latestPurchaseCost" | "defaultSellingPrice" | "stockValue" | "minimumQuantity" | "stockStatus";

const movementStyles: Record<string, string> = {
  PURCHASE_IN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SALE_OUT: "border-orange-200 bg-orange-50 text-orange-700",
  INVOICE_VOID_RETURN: "border-sky-200 bg-sky-50 text-sky-700",
  ADJUSTMENT_IN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ADJUSTMENT_OUT: "border-red-200 bg-red-50 text-red-700",
};

export function StockTable({ balances, movements, batches = [], products = [], view = "all" }: StockTableProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [productStatus, setProductStatus] = useState("all");
  const [sort, setSort] = useState<{ key: StockSortKey; direction: "asc" | "desc" }>({ key: "productName", direction: "asc" });
  const lowStock = (balance: StockBalance) =>
    balance.minimumQuantity > 0 && balance.quantity <= balance.minimumQuantity;

  const showBalances = view === "balances" || view === "all";
  const showMovements = view === "movements" || view === "all";
  const nonPurchaseMovements = movements.filter((movement) => movement.movementType !== "PURCHASE_IN");
  const openBatchCount = new Map<string, number>();
  for (const batch of batches) {
    if (batch.quantityRemaining > 0) openBatchCount.set(batch.productId, (openBatchCount.get(batch.productId) ?? 0) + 1);
  }
  const filteredBalances = balances.filter((balance) =>
    (balance.productName.toLowerCase().includes(query.toLowerCase()) || (balance.category ?? "").toLowerCase().includes(query.toLowerCase())) &&
    (status === "all" || balance.stockStatus === status) &&
    (productStatus === "all" || balance.productStatus === productStatus),
  ).sort((left, right) => {
    const leftValue = left[sort.key] ?? "";
    const rightValue = right[sort.key] ?? "";
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), "id-ID", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const setSortKey = (key: StockSortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  };

  const sortIcon = (key: StockSortKey) => {
    if (sort.key !== key) return <ArrowUpDown className="size-3 opacity-40" />;
    return sort.direction === "asc" ? <ArrowUp className="size-3 text-primary" /> : <ArrowDown className="size-3 text-primary" />;
  };

  const sortHeader = (label: string, key: StockSortKey, align: "left" | "right" = "left") => (
    <button type="button" onClick={() => setSortKey(key)} className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500 transition-colors hover:text-stone-900 ${align === "right" ? "ml-auto" : ""}`} aria-label={`Urutkan berdasarkan ${label}`}>
      {label}{sortIcon(key)}
    </button>
  );

  return (
    <div className="space-y-6">
      {showBalances && <section className="erp-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
            <Boxes className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Produk & stok</h2>
            <p className="mt-0.5 text-xs text-stone-500">HPP rata-rata digunakan saat invoice diterbitkan; harga beli terakhir tetap tersimpan per supplier.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-stone-200 bg-stone-50/60 p-4 sm:flex-row sm:flex-wrap">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk atau kategori" aria-label="Cari produk atau kategori" className="h-10 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70 sm:min-w-56" />
          <select value={productStatus} onChange={(event) => setProductStatus(event.target.value)} aria-label="Filter status produk" className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-500"><option value="all">Semua produk</option><option value="ACTIVE">Produk aktif</option><option value="INACTIVE">Produk nonaktif</option></select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter status stok" className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-500"><option value="all">Semua stok</option><option value="Aman">Stok aman</option><option value="Menipis">Stok menipis</option><option value="Habis">Stok habis</option></select>
        </div>
        {filteredBalances.length === 0 ? (
          <div className="py-12">
            <EmptyState icon={PackageSearch} title="Belum ada produk" description="Tambahkan produk terlebih dahulu untuk mulai mengelola stok." />
          </div>
        ) : (
          <>
            <div className="erp-table-wrap hidden md:block">
              <table className="erp-table w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/80">
                    <th className="px-5 py-3 text-left">{sortHeader("Produk", "productName")}</th>
                    <th className="px-3 py-3 text-left">{sortHeader("Kategori", "category")}</th>
                    <th className="px-3 py-3 text-left">{sortHeader("Ukuran", "size")}</th>
                    <th className="px-3 py-3 text-right">{sortHeader("Stok", "quantity", "right")}</th>
                    <th className="px-3 py-3 text-right">{sortHeader("HPP rata-rata", "averageUnitCost", "right")}</th>
                    <th className="px-3 py-3 text-right">{sortHeader("Harga beli terakhir", "latestPurchaseCost", "right")}</th>
                    <th className="px-3 py-3 text-right">{sortHeader("Harga jual default", "defaultSellingPrice", "right")}</th>
                    <th className="px-3 py-3 text-right">{sortHeader("Nilai persediaan", "stockValue", "right")}</th>
                    <th className="px-3 py-3 text-right">{sortHeader("Minimum", "minimumQuantity", "right")}</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredBalances.map((balance) => (
                    <tr key={balance.productId} className="hover:bg-stone-50/60">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-stone-900">{balance.productName}</p>
                        <p className="mt-1 text-xs text-stone-500">{balance.sku || "Tanpa SKU"}{balance.size ? ` · ${balance.size}` : ""}</p>
                        <div className="mt-2"><Badge variant="outline" className={balance.productStatus === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700" : "border-stone-300 bg-stone-100 text-[10px] text-stone-600"}>{balance.productStatus === "ACTIVE" ? "Produk aktif" : "Produk nonaktif"}</Badge></div>
                      </td>
                      <td className="px-3 py-3 text-sm text-stone-600">{balance.category ?? "Tanpa kategori"}</td>
                      <td className="px-3 py-3 text-sm text-stone-600">{balance.size || "—"}</td>
                      <td className={`px-3 py-3 text-right text-base font-bold tabular-nums ${lowStock(balance) ? "text-red-600" : "text-stone-900"}`}>
                        {formatNumber(balance.quantity)} <span className="text-xs font-medium text-stone-500">{balance.unit}</span>
                        {lowStock(balance) && <Badge variant="outline" className="ml-2 border-red-200 bg-red-50 text-[10px] text-red-700">Menipis</Badge>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-amber-700">{balance.averageUnitCost > 0 ? formatCurrency(balance.averageUnitCost) : "—"}<p className="mt-1 text-[10px] font-medium text-amber-600/80">Dipakai invoice</p></td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{balance.latestPurchaseCost ? formatCurrency(balance.latestPurchaseCost) : "—"}<p className="mt-1 text-[10px] font-medium text-stone-400">{balance.supplierCount ?? 0} supplier</p></td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-sky-700">{balance.defaultSellingPrice > 0 ? formatCurrency(balance.defaultSellingPrice) : "—"}<p className={`mt-1 text-[10px] ${balance.marginPercentage !== undefined && balance.marginPercentage < 15 ? "text-red-600" : "text-stone-400"}`}>{balance.marginPercentage !== undefined ? `${balance.marginPercentage.toFixed(1)}% margin` : "margin belum tersedia"} · {openBatchCount.get(balance.productId) ?? 0} batch</p></td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-stone-900">{formatCurrency(balance.stockValue)}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-stone-600">{balance.minimumQuantity > 0 ? `${formatNumber(balance.minimumQuantity)} ${balance.unit}` : "—"}</td>
                      <td className="px-5 py-3 text-right"><StockRowActions balance={balance} product={productMap.get(balance.productId)} movements={movements} batches={batches} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-stone-100 md:hidden">
              {filteredBalances.map((balance) => (
                <article key={balance.productId} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-stone-900">{balance.productName}</p>
                        <p className="mt-1 text-xs text-stone-500">{balance.sku || "Tanpa SKU"}</p>
                    </div>
                    {lowStock(balance) && <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 text-[10px] text-red-700">Menipis</Badge>}
                  </div>
                   <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-3">
                    <div>
                      <p className="text-[11px] text-stone-500">Stok tersedia</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-stone-900">{formatNumber(balance.quantity)} <span className="text-xs font-medium text-stone-500">{balance.unit}</span></p>
                    </div>
                    <div className="text-right">
                       <p className="text-[11px] text-stone-500">Nilai persediaan</p>
                      <p className="mt-1 font-bold tabular-nums text-stone-900">{formatCurrency(balance.stockValue)}</p>
                    </div>
                    <div className="border-t border-stone-200 pt-2">
                      <p className="text-[11px] text-stone-500">HPP rata-rata</p>
                      <p className="mt-1 text-xs font-semibold text-amber-700">{balance.averageUnitCost > 0 ? formatCurrency(balance.averageUnitCost) : "—"}</p>
                    </div>
                    <div className="border-t border-stone-200 pt-2 text-right">
                      <p className="text-[11px] text-stone-500">Jual default</p>
                      <p className="mt-1 text-xs font-semibold text-sky-700">{balance.defaultSellingPrice > 0 ? formatCurrency(balance.defaultSellingPrice) : "—"}</p>
                    </div>
                  </div>
                   <div className="flex justify-end"><StockRowActions balance={balance} product={productMap.get(balance.productId)} movements={movements} batches={batches} /></div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>}

      {showMovements && <section className="erp-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700"><History className="size-4" /></div>
           <div><h2 className="text-sm font-semibold text-stone-900">Mutasi stok</h2><p className="mt-0.5 text-xs text-stone-500">Invoice, barang masuk, reject pabrik, dan penyesuaian stok.</p></div>
        </div>
        {nonPurchaseMovements.length === 0 ? (
          <div className="py-12"><EmptyState icon={History} title="Belum ada mutasi stok" description="Invoice yang diterbitkan dan penyesuaian stok akan muncul di sini." /></div>
        ) : (
          <div className="divide-y divide-stone-100">
            {nonPurchaseMovements.map((movement) => {
              const incoming = movement.quantityDelta > 0;
              return (
                <div key={movement.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${incoming ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                      {incoming ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-stone-900">{movement.productName}</p>
                        <Badge variant="outline" className={`text-[10px] ${movementStyles[movement.movementType] || ""}`}>{getStockMovementLabel(movement.movementType)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {movement.supplierName ? `Supplier: ${movement.supplierName}` : movement.customerName ? `Restoran: ${movement.customerName}` : movement.notes || "Penyesuaian stok"}
                        {movement.purchaseUnitCost ? ` · harga beli ${formatCurrency(movement.purchaseUnitCost)}/${movement.unit}` : ""}
                        {movement.invoiceNumber ? ` · ${movement.invoiceNumber}` : ""}
                        {movement.receiptNumber ? ` · ${movement.receiptNumber}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-5 pl-11 sm:justify-end sm:pl-0">
                    <div className={`text-right text-sm font-bold tabular-nums ${incoming ? "text-emerald-700" : "text-orange-700"}`}>
                      {incoming ? "+" : ""}{formatNumber(movement.quantityDelta)} {movement.unit}
                      <p className="mt-1 text-[11px] font-normal text-stone-400">Saldo {formatNumber(movement.balanceAfter)} {movement.unit}</p>
                    </div>
                    <p className="shrink-0 text-right text-xs text-stone-400">{formatDatetime(movement.occurredAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>}
    </div>
  );
}
