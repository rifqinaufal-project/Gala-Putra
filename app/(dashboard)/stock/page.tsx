import type { Metadata } from "next";
import { AlertTriangle, Boxes, PackageCheck, PackageX, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddStockReceiptDialog } from "@/components/stock/add-stock-receipt-dialog";
import { StockTable } from "@/components/stock/stock-table";
import { getInventoryAction } from "@/lib/actions/inventory";
import { getProductsAction } from "@/lib/actions/products";
import { getSuppliersAction } from "@/lib/actions/suppliers";
import { requireRole } from "@/lib/security/auth";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Stok, Harga & Modal" };

export default async function StockPage() {
  await requireRole(["OWNER", "FINANCE"]);
  const [{ balances, movements, batches }, products, suppliers] = await Promise.all([
    getInventoryAction(),
    getProductsAction(),
    getSuppliersAction(),
  ]);
  const activeBalances = balances.filter((balance) => balance.productStatus === "ACTIVE");
  const lowStock = activeBalances.filter((balance) => balance.minimumQuantity > 0 && balance.quantity <= balance.minimumQuantity);
  const outOfStock = activeBalances.filter((balance) => balance.quantity <= 0);
  const totalUnits = activeBalances.reduce((sum, balance) => sum + balance.quantity, 0);
  const totalStockValue = activeBalances.reduce((sum, balance) => sum + balance.stockValue, 0);
  const risingPurchases = activeBalances.filter((balance) => (balance.latestPurchaseCost ?? 0) > balance.averageUnitCost * 1.1);

  return <div className="space-y-6">
     <PageHeader title="Stok, Harga & Modal" description="Kelola produk, stok normal, stok reject, biaya, dan harga jual dari satu modul.">
       <AddProductDialog />
       <AddStockReceiptDialog products={products} suppliers={suppliers} />
     </PageHeader>
    <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 xl:grid-cols-5 xl:gap-4"><MetricCard accent="emerald" title="Produk aktif" value={activeBalances.length} suffix="produk" icon={Boxes} /><MetricCard accent="sky" title="Total unit" value={formatNumber(totalUnits)} suffix="unit" icon={PackageCheck} /><MetricCard accent="violet" title="Nilai persediaan" value={totalStockValue} isCurrency internal icon={WalletCards} /><MetricCard accent="amber" title="Stok menipis" value={lowStock.length} suffix="produk" icon={AlertTriangle} /><MetricCard accent="red" title="Stok habis" value={outOfStock.length} suffix="produk" icon={PackageX} /></div>
    {risingPurchases.length > 0 && <section className="grid gap-3" aria-label="Peringatan harga beli">
      {risingPurchases.length > 0 && <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-950"><p className="font-semibold">Harga beli meningkat</p><p className="mt-1 text-xs leading-5">Ada {risingPurchases.length} produk dengan harga beli terakhir lebih tinggi dari HPP rata-rata.</p></div>}
    </section>}
     <StockTable balances={balances} movements={movements} batches={batches} products={products} view="balances" />
  </div>;
}
