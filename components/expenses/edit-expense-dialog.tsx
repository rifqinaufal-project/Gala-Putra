"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { updateExpenseAction } from "@/lib/actions/expenses";
import type { Expense } from "@/types";

interface EditExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditExpenseDialog({ expense, open, onOpenChange }: EditExpenseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState(expense.category);
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState<number>(expense.amount ?? 0);
  const [expenseDate, setExpenseDate] = useState(
    expense.expenseDate.slice(0, 10)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!description || amount <= 0) {
      setError("Deskripsi dan Jumlah biaya wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await updateExpenseAction({
      id: expense.id,
      category,
      description,
      amount: amount,
      expenseDate,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Pengeluaran Operasional</DialogTitle>
          <DialogDescription>
            Perbarui detail pengeluaran operasional.
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
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
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
            <CurrencyInput value={amount} onChange={setAmount} placeholder="350000" />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded p-2.5">{error}</p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
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
