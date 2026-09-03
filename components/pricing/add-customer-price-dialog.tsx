"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCustomerPriceAction } from "@/lib/actions/pricing";
import type { Customer, Product } from "@/types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface AddCustomerPriceDialogProps {
  customers: Customer[];
  products: Product[];
}

export function AddCustomerPriceDialog({
  customers,
  products,
}: AddCustomerPriceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [sellingPrice, setSellingPrice] = useState(0);

  const resetForm = () => {
    setCustomerId(customers[0]?.id || "");
    setProductId(products[0]?.id || "");
    setSellingPrice(0);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!customerId || !productId || !sellingPrice) {
      setError("Pilih restoran, produk, dan masukkan harga khusus.");
      return;
    }

    setLoading(true);

    const res = await createCustomerPriceAction({
      customerId,
      productId,
      sellingPrice: sellingPrice,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      resetForm();
      setOpen(false);
      toast.success(res.message);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="h-10 px-4 text-xs cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5 mr-1" />
        Tambah Harga Khusus
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Harga Khusus Restoran</DialogTitle>
          <DialogDescription>
            Tetapkan harga jual khusus per produk untuk restoran tertentu.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Restoran / Pelanggan <span className="text-red-500">*</span>
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full h-10 text-xs border border-input rounded-xl px-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
              required
            >
              <option value="" disabled>Pilih Restoran</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.contactName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Produk <span className="text-red-500">*</span>
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full h-10 text-xs border border-input rounded-xl px-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
              required
            >
              <option value="" disabled>Pilih Produk</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.size ? `[${p.size}]` : ""} ({p.defaultUnit}) - Default: {formatCurrency(p.defaultSellingPrice ?? 0)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Harga Jual Khusus (Rp) <span className="text-red-500">*</span>
            </label>
            <CurrencyInput value={sellingPrice} onChange={setSellingPrice} placeholder="0" className="h-10 rounded-xl border-stone-200" />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Simpan Harga Khusus
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
