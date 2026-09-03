"use client";

import { useState, type ReactElement } from "react";
import { Truck } from "lucide-react";
import { CancelStockReceiptDialog } from "@/components/stock/cancel-stock-receipt-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatCurrency, formatDatetime, formatNumber } from "@/lib/utils";
import type { StockBalance, StockBatch, StockMovement } from "@/types";

interface ProductSupplierPurchasesSheetProps {
  balance: StockBalance;
  movements: StockMovement[];
  batches: StockBatch[];
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProductSupplierPurchasesSheet({ balance, movements, batches, trigger, open: controlledOpen, onOpenChange }: ProductSupplierPurchasesSheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const purchases = movements.filter((movement) => movement.productId === balance.productId && movement.movementType === "PURCHASE_IN" && !movement.receiptCancelledAt);
  const productBatches = batches.filter((batch) => batch.productId === balance.productId);
  const suppliers = new Map<string, { name: string; quantity: number; total: number; latestCost: number; latestAt: string; remaining: number }>();

  for (const purchase of purchases) {
    const name = purchase.supplierName || "Supplier lama";
    const entry = suppliers.get(name) ?? { name, quantity: 0, total: 0, latestCost: purchase.purchaseUnitCost ?? 0, latestAt: purchase.occurredAt, remaining: 0 };
    const cost = purchase.purchaseUnitCost ?? 0;
    entry.quantity += purchase.quantityDelta;
    entry.total += purchase.quantityDelta * cost;
    if (new Date(purchase.occurredAt) > new Date(entry.latestAt)) { entry.latestAt = purchase.occurredAt; entry.latestCost = cost; }
    suppliers.set(name, entry);
  }
  for (const batch of productBatches) {
    const name = batch.supplierName || "Supplier lama";
    const entry = suppliers.get(name) ?? { name, quantity: 0, total: 0, latestCost: batch.unitCost, latestAt: batch.receivedAt, remaining: 0 };
    entry.remaining += batch.quantityRemaining;
    suppliers.set(name, entry);
  }

  return <Sheet open={open} onOpenChange={setOpen}>
    {controlledOpen === undefined && <SheetTrigger render={trigger ?? <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" />}>
      {!trigger && <><Truck className="mr-1.5 size-3.5" /> Lihat pembelian supplier</>}
    </SheetTrigger>}
    <SheetContent mobileBottom className="w-full gap-0 overflow-y-auto border-stone-200 bg-white sm:max-w-2xl">
      <SheetHeader className="border-b border-stone-200 px-5 py-5 pr-14">
        <SheetTitle className="text-stone-900">Pembelian supplier</SheetTitle>
        <SheetDescription>{balance.productName} · harga pembelian asli, batch tersisa, dan riwayat penerimaan.</SheetDescription>
      </SheetHeader>
      {purchases.length === 0 && productBatches.length === 0 ? <div className="py-16"><EmptyState icon={Truck} title="Belum ada pembelian supplier" description="Penerimaan barang untuk produk ini akan muncul di sini." /></div> : <div className="space-y-6 p-5">
        <section>
          <h3 className="text-sm font-semibold text-stone-900">Ringkasan supplier</h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-stone-200">
            {[...suppliers.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt)).map((supplier) => <div key={supplier.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-stone-100 px-4 py-3 last:border-b-0">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900">{supplier.name}</p><p className="mt-1 text-xs text-stone-500">{formatNumber(supplier.quantity)} {balance.unit} dibeli · rata-rata {supplier.quantity > 0 ? formatCurrency(supplier.total / supplier.quantity) : "—"}</p></div>
              <div className="text-right text-xs"><p className="font-semibold tabular-nums text-emerald-700">{formatCurrency(supplier.latestCost)}</p><p className="mt-1 tabular-nums text-stone-500">Sisa {formatNumber(supplier.remaining)} {balance.unit}</p></div>
            </div>)}
          </div>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-stone-900">Riwayat penerimaan</h3>
          <div className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
            {purchases.map((purchase) => <article key={purchase.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3"><div><p className="text-sm font-semibold text-stone-900">{purchase.supplierName || "Supplier lama"}</p><p className="mt-1 text-xs text-stone-500">{formatDatetime(purchase.occurredAt)} · {purchase.receiptNumber || "Penerimaan stok"}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums text-stone-900">{formatNumber(purchase.quantityDelta)} {purchase.unit}</p><p className="mt-1 text-xs font-semibold tabular-nums text-emerald-700">{purchase.purchaseUnitCost ? `${formatCurrency(purchase.purchaseUnitCost)}/${purchase.unit}` : "—"}</p>{purchase.receiptId && <CancelStockReceiptDialog receiptId={purchase.receiptId} receiptNumber={purchase.receiptNumber} />}</div></article>)}
          </div>
        </section>
      </div>}
    </SheetContent>
  </Sheet>;
}
