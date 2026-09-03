"use client";

import { useState } from "react";
import { Calculator, ClipboardPenLine, Edit, MoreHorizontal, Power, Trash2, Truck } from "lucide-react";
import { AdjustStockDialog } from "@/components/stock/adjust-stock-dialog";
import { AdjustProductCostDialog } from "@/components/stock/adjust-product-cost-dialog";
import { ProductSupplierPurchasesSheet } from "@/components/stock/product-supplier-purchases-sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { StockBalance, StockBatch, StockMovement } from "@/types";
import type { Product } from "@/types";
import { EditProductDialog } from "@/components/products/edit-product-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteProductAction, toggleProductStatusAction } from "@/lib/actions/products";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function StockRowActions({ balance, product, movements, batches }: { balance: StockBalance; product?: Product; movements: StockMovement[]; batches: StockBatch[] }) {
  const router = useRouter();
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const toggleStatus = async () => {
    if (!product) return;
    setLoading(true);
    const result = await toggleProductStatusAction(product.id, product.status);
    setLoading(false);
    if ("error" in result && result.error) toast.error(`Gagal: ${result.error}`); else { toast.success("message" in result ? result.message : "Produk berhasil dihapus."); router.refresh(); }
  };
  const deleteProduct = async () => {
    if (!product) return;
    setLoading(true);
    const result = await deleteProductAction(product.id);
    setLoading(false);
    if ("error" in result && result.error) toast.error(`Gagal: ${result.error}`); else { toast.success("message" in result ? result.message : "Produk berhasil dihapus."); router.refresh(); }
  };
  return <>
    <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" className="size-9 rounded-lg" aria-label={`Aksi ${balance.productName}`} />}>
      <MoreHorizontal className="size-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64 p-1.5">
      <DropdownMenuItem onClick={() => setPurchasesOpen(true)} className="min-h-11 gap-3 px-3 py-2 text-[15px] font-medium"><Truck className="size-[18px]" /> Lihat pembelian supplier</DropdownMenuItem>
      <DropdownMenuItem onClick={() => setAdjustmentOpen(true)} className="min-h-11 gap-3 px-3 py-2 text-[15px] font-medium"><ClipboardPenLine className="size-[18px]" /> Sesuaikan stok</DropdownMenuItem>
      <DropdownMenuItem onClick={() => setCostOpen(true)} className="min-h-11 gap-3 px-3 py-2 text-[15px] font-medium"><Calculator className="size-[18px]" /> Sesuaikan HPP</DropdownMenuItem>
      {product && <><DropdownMenuItem onClick={() => setEditing(true)} className="min-h-11 gap-3 px-3 py-2 text-[15px] font-medium"><Edit className="size-[18px]" /> Edit produk</DropdownMenuItem><DropdownMenuItem onClick={toggleStatus} disabled={loading} className="min-h-11 gap-3 px-3 py-2 text-[15px] font-medium"><Power className="size-[18px]" /> {product.status === "ACTIVE" ? "Nonaktifkan produk" : "Aktifkan produk"}</DropdownMenuItem><DropdownMenuItem onClick={() => setDeleting(true)} className="min-h-11 gap-3 px-3 py-2 text-[15px] font-medium text-red-700 focus:text-red-700"><Trash2 className="size-[18px]" /> Hapus produk</DropdownMenuItem></>}
    </DropdownMenuContent>
    </DropdownMenu>
    <ProductSupplierPurchasesSheet balance={balance} movements={movements} batches={batches} open={purchasesOpen} onOpenChange={setPurchasesOpen} />
    <AdjustStockDialog balance={balance} open={adjustmentOpen} onOpenChange={setAdjustmentOpen} />
    <AdjustProductCostDialog balance={balance} controlledOpen={costOpen} onOpenChange={setCostOpen} />
    {product && <EditProductDialog product={product} open={editing} onOpenChange={setEditing} />}
    {product && <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Hapus produk permanen?" description={`Stok, batch, mutasi, penerimaan, serta histori harga "${product.name}" akan dihapus permanen.`} note="Invoice dan item invoice tetap tersimpan sebagai snapshot historis, tetapi tidak lagi terhubung ke produk ini." confirmLabel="Hapus produk" onConfirm={deleteProduct} />}
  </>;
}
