"use client";

import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { Product } from "@/types";
import { Search, MoreHorizontal, Edit, Power, Trash2, Loader2, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { toggleProductStatusAction, deleteProductAction } from "@/lib/actions/products";
import { EditProductDialog } from "./edit-product-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

function getStockBadge(qty: number, min: number) {
  if (qty <= 0) return { label: "Out of Stock", className: "bg-red-50 text-red-700 border-red-200" };
  if (qty <= min) return { label: "Low Stock", className: "bg-orange-50 text-orange-700 border-orange-200" };
  return { label: "In Stock", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

interface ProductTableProps {
  initialProducts?: Product[];
  canManage?: boolean;
}

export function ProductTable({ initialProducts = [], canManage = false }: ProductTableProps) {
  const productsList = initialProducts;
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggleStatus = async (product: Product) => {
    setLoadingId(product.id);
    const res = await toggleProductStatusAction(product.id, product.status);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal: ${res.error}`);
    } else {
      toast.success(res.message || "Status produk berhasil diperbarui");
      router.refresh();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setLoadingId(deletingProduct.id);
    const res = await deleteProductAction(deletingProduct.id);
    setLoadingId(null);
    setDeletingProduct(null);
    if (res.error) {
      toast.error(`Gagal menghapus: ${res.error}`);
    } else {
      toast.success("message" in res ? res.message : "Produk berhasil dihapus");
      router.refresh();
    }
  };

  const filtered = productsList.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "ALL" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <>
      <div className="erp-surface overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-border">
          <div className="relative flex-1 max-w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari produk, kategori..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`min-h-9 px-3.5 py-2 text-xs rounded-xl font-semibold transition-colors shrink-0 ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "ALL" ? "Semua" : s === "ACTIVE" ? "Aktif" : "Nonaktif"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Tidak ada produk"
            description="Coba ubah kata kunci pencarian atau filter."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs font-semibold">ID Produk</TableHead>
                    <TableHead className="text-xs font-semibold">Nama Produk</TableHead>
                    <TableHead className="text-xs font-semibold">Kategori</TableHead>
                    <TableHead className="text-xs font-semibold">Ukuran / Size</TableHead>
                    <TableHead className="text-xs font-semibold">Satuan</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Harga Beli</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Harga Jual</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Margin</TableHead>
                    <TableHead className="text-xs font-semibold">Stok</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    {canManage && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => (
                    <TableRow key={product.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {product.id.includes("-") ? product.id.split("-")[0] : product.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{product.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.category}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {product.size ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {product.size}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.defaultUnit}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {product.activeCost ? formatCurrency(product.activeCost) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {product.defaultSellingPrice ? formatCurrency(product.defaultSellingPrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {product.estimatedMargin != null ? (
                          <span className={product.estimatedMargin >= 20 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                            {formatPercent(product.estimatedMargin)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const badge = getStockBadge(product.stockQuantity ?? 0, product.minimumStock ?? 0);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.status === "ACTIVE" ? "default" : "secondary"} className="text-[11px]">
                          {product.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      {canManage && <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            aria-label="Aksi produk"
                          >
                            {loadingId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                              <MoreHorizontal className="w-4 h-4" />
                            )}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => setEditingProduct(product)}>
                              <Edit className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              Edit Produk
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleToggleStatus(product)}>
                              <Power className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              {product.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={() => setDeletingProduct(product)}>
                              <Trash2 className="w-3.5 h-3.5 mr-2 text-red-600" />
                              Hapus Produk
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <div className="divide-y divide-border lg:hidden">
              {filtered.map((product) => (
                <div key={product.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{product.name}</p>
                      <Badge variant={product.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                        {product.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {product.category}{product.size ? ` · ${product.size}` : ""} · {product.defaultUnit}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(() => {
                        const badge = getStockBadge(product.stockQuantity ?? 0, product.minimumStock ?? 0);
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {product.stockQuantity ?? 0} {product.defaultUnit}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      <span className="text-muted-foreground">
                        Jual: <span className="font-medium text-foreground">{product.defaultSellingPrice ? formatCurrency(product.defaultSellingPrice) : "—"}</span>
                      </span>
                      {product.activeCost != null && (
                        <span className="text-muted-foreground">
                          Beli: <span className="font-medium text-foreground">{formatCurrency(product.activeCost)}</span>
                        </span>
                      )}
                      {product.estimatedMargin != null && (
                        <span className={product.estimatedMargin >= 20 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                          {formatPercent(product.estimatedMargin)}
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                        aria-label="Aksi produk"
                      >
                        {loadingId === product.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="w-5 h-5" />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setEditingProduct(product)}>
                          <Edit className="w-4 h-4 mr-2 text-muted-foreground" />
                          Edit Produk
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleToggleStatus(product)}>
                          <Power className="w-4 h-4 mr-2 text-muted-foreground" />
                          {product.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={() => setDeletingProduct(product)}>
                          <Trash2 className="w-4 h-4 mr-2 text-red-600" />
                          Hapus Produk
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {filtered.length} dari {productsList.length} produk
          </p>
        </div>
      </div>

      {canManage && editingProduct && (
        <EditProductDialog
          product={editingProduct}
          open={!!editingProduct}
          onOpenChange={(open) => {
            if (!open) setEditingProduct(null);
          }}
        />
      )}

      {canManage && deletingProduct && (
        <ConfirmDialog
          open={!!deletingProduct}
          onOpenChange={(open) => {
            if (!open) setDeletingProduct(null);
          }}
          title="Hapus produk permanen?"
          description={`Stok, batch, mutasi, penerimaan, serta histori harga "${deletingProduct.name}" akan dihapus permanen.`}
          note="Invoice dan item invoice tetap tersimpan sebagai snapshot historis, tetapi tidak lagi terhubung ke produk ini."
          confirmLabel="Hapus produk"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
