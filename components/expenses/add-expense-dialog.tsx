"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { createExpenseAction } from "@/lib/actions/expenses";

export function AddExpenseDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState("Operasional");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const resetForm = () => {
    setDescription("");
    setAmount(0);
    setCategory("Operasional");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!description || amount <= 0) {
      setError("Deskripsi dan Jumlah biaya wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await createExpenseAction({
      category,
      description,
      amount: amount,
      expenseDate,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      resetForm();
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} className="cursor-pointer">
        <Plus className="w-4 h-4 mr-1.5" />
        Tambah Pengeluaran
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Pengeluaran Operasional</DialogTitle>
          <DialogDescription>
            Masukkan pengeluaran umum toko/gudang (gaji, sewa, listrik, dll).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Kategori
              </label>
              <Select value={category} onValueChange={(v) => setCategory(v || "Operasional")}>
                <SelectTrigger>
                  <SelectValue>{category}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Operasional">Operasional Gudang</SelectItem>
                  <SelectItem value="Gaji & Bonus">Gaji & Bonus Staff</SelectItem>
                  <SelectItem value="Listrik & Air">Listrik, Air & Internet</SelectItem>
                  <SelectItem value="Sewa & Maintenance">Sewa & Maintenance</SelectItem>
                  <SelectItem value="Lainnya">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Tanggal Pengeluaran
              </label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Deskripsi Pengeluaran <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Pembelian Kantong Plastik & Lakban Gudang"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Jumlah (Rp) <span className="text-red-500">*</span>
            </label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              placeholder="350000"
            />
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
              Simpan Pengeluaran
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
