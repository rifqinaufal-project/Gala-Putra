"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createProductAction } from "@/lib/actions/products";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CUSTOM_PRODUCT_OPTION, PRODUCT_CATEGORIES, PRODUCT_UNITS } from "./product-form-options";

export function AddProductDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [categoryChoice, setCategoryChoice] = useState("Ikan");
  const [customCategory, setCustomCategory] = useState("");
  const [size, setSize] = useState("");
  const [unitChoice, setUnitChoice] = useState("kg");
  const [customUnit, setCustomUnit] = useState("");
  const [defaultSellingPrice, setDefaultSellingPrice] = useState(0);
  const [activeCost, setActiveCost] = useState(0);

  const resetForm = () => {
    setName("");
    setCategoryChoice("Ikan");
    setCustomCategory("");
    setSize("");
    setUnitChoice("kg");
    setCustomUnit("");
    setDefaultSellingPrice(0);
    setActiveCost(0);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const category = categoryChoice === CUSTOM_PRODUCT_OPTION ? customCategory.trim() : categoryChoice;
    const defaultUnit = unitChoice === CUSTOM_PRODUCT_OPTION ? customUnit.trim() : unitChoice;

    if (!name.trim() || !category || !defaultUnit) {
      setError("Nama produk, kategori, dan satuan wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await createProductAction({
      name,
      category,
      size: size || undefined,
      defaultUnit,
      defaultSellingPrice: defaultSellingPrice > 0 ? defaultSellingPrice : undefined,
      activeCost: activeCost > 0 ? activeCost : undefined,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      toast.success(res.message || "Produk berhasil ditambahkan");
      setOpen(false);
      resetForm();
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        className="cursor-pointer"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Tambah Produk
      </Button>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Produk Baru</DialogTitle>
          <DialogDescription>
            Masukkan rincian produk seafood dan harga jual default.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Nama Produk <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Udang Vaname Size 30"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Kategori
              </label>
              <select
                value={categoryChoice}
                onChange={(event) => setCategoryChoice(event.target.value)}
                className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
              >
                {PRODUCT_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
                <option value={CUSTOM_PRODUCT_OPTION}>+ Buat kategori sendiri</option>
              </select>
              {categoryChoice === CUSTOM_PRODUCT_OPTION && (
                <Input
                  className="mt-2 h-10 rounded-xl border-stone-200"
                  placeholder="Tulis kategori baru"
                  value={customCategory}
                  onChange={(event) => setCustomCategory(event.target.value)}
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Size / Ukuran
              </label>
              <Input
                placeholder="Size 30 / 500g-700g / Jumbo"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Satuan
              </label>
              <select
                value={unitChoice}
                onChange={(event) => setUnitChoice(event.target.value)}
                className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-3 focus:ring-stone-200/70"
              >
                {PRODUCT_UNITS.map((option) => <option key={option} value={option}>{option}</option>)}
                <option value={CUSTOM_PRODUCT_OPTION}>+ Buat satuan sendiri</option>
              </select>
              {unitChoice === CUSTOM_PRODUCT_OPTION && (
                <Input
                  className="mt-2 h-10 rounded-xl border-stone-200"
                  placeholder="Contoh: keranjang"
                  value={customUnit}
                  onChange={(event) => setCustomUnit(event.target.value)}
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Harga Jual (Rp)
              </label>
              <CurrencyInput
                value={defaultSellingPrice}
                onChange={setDefaultSellingPrice}
                placeholder="110000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                HPP Beli (Rp)
              </label>
              <CurrencyInput
                value={activeCost}
                onChange={setActiveCost}
                placeholder="85000"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded p-2.5">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan Produk
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
