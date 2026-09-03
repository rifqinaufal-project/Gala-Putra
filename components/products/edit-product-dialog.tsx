"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateProductAction } from "@/lib/actions/products";
import type { Product } from "@/types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { choiceFor, CUSTOM_PRODUCT_OPTION, PRODUCT_CATEGORIES, PRODUCT_UNITS } from "./product-form-options";

interface EditProductDialogProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProductDialog({
  product,
  open,
  onOpenChange,
}: EditProductDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(product.name);
  const [categoryChoice, setCategoryChoice] = useState(() => choiceFor(product.category, PRODUCT_CATEGORIES));
  const [customCategory, setCustomCategory] = useState(() => PRODUCT_CATEGORIES.includes(product.category as typeof PRODUCT_CATEGORIES[number]) ? "" : product.category);
  const [size, setSize] = useState(product.size || "");
  const [unitChoice, setUnitChoice] = useState(() => choiceFor(product.defaultUnit || "kg", PRODUCT_UNITS));
  const [customUnit, setCustomUnit] = useState(() => PRODUCT_UNITS.includes((product.defaultUnit || "kg") as typeof PRODUCT_UNITS[number]) ? "" : product.defaultUnit || "");
  const [defaultSellingPrice, setDefaultSellingPrice] = useState<number>(Number(product.defaultSellingPrice) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const category = categoryChoice === CUSTOM_PRODUCT_OPTION ? customCategory.trim() : categoryChoice;
    const defaultUnit = unitChoice === CUSTOM_PRODUCT_OPTION ? customUnit.trim() : unitChoice;

    if (!name || !category || !defaultUnit) {
      setError("Nama produk, kategori, dan satuan wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await updateProductAction({
      id: product.id,
      name,
      category,
      size: size || undefined,
      defaultUnit,
      defaultSellingPrice: defaultSellingPrice > 0 ? defaultSellingPrice : undefined,
      status: product.status,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      toast.success(res.message || "Produk berhasil diperbarui");
      onOpenChange(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Produk Seafood</DialogTitle>
          <DialogDescription>
            Perbarui identitas produk dan harga jual default. HPP berubah otomatis melalui penerimaan barang.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Nama Produk <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Kategori <span className="text-red-500">*</span>
              </label>
              <select
                value={categoryChoice}
                onChange={(event) => setCategoryChoice(event.target.value)}
                className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
                required
              >
                {PRODUCT_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
                <option value={CUSTOM_PRODUCT_OPTION}>+ Buat kategori sendiri</option>
              </select>
              {categoryChoice === CUSTOM_PRODUCT_OPTION && <Input className="mt-2 h-10 rounded-xl border-stone-200" placeholder="Tulis kategori baru" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} autoFocus />}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Ukuran / Size (Opsional)
              </label>
              <Input
                placeholder="40-50, Size L, Big"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Satuan Default <span className="text-red-500">*</span>
            </label>
            <select
              value={unitChoice}
              onChange={(event) => setUnitChoice(event.target.value)}
              className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
              required
            >
              {PRODUCT_UNITS.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value={CUSTOM_PRODUCT_OPTION}>+ Buat satuan sendiri</option>
            </select>
            {unitChoice === CUSTOM_PRODUCT_OPTION && <Input className="mt-2 h-10 rounded-xl border-stone-200" placeholder="Contoh: keranjang" value={customUnit} onChange={(event) => setCustomUnit(event.target.value)} autoFocus />}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Harga jual default (Rp)
              </label>
              <CurrencyInput
                value={defaultSellingPrice}
                onChange={setDefaultSellingPrice}
                placeholder="110000"
              />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-950">HPP rata-rata saat ini</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-amber-900">
                {product.activeCost ? `Rp ${new Intl.NumberFormat("id-ID").format(product.activeCost)}` : "Belum tersedia"}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-amber-900/75">HPP tidak diubah dari Edit Produk. Catat harga baru melalui Barang Masuk.</p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded p-2.5">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
