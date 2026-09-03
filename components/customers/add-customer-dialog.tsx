"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCustomerAction } from "@/lib/actions/customers";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function AddCustomerDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [paymentTermDays, setPaymentTermDays] = useState("7");
  const [buyerType, setBuyerType] = useState<"PABRIK" | "PASAR" | "PERORANGAN" | "LAINNYA">("PABRIK");

  const resetForm = () => {
    setName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setBillingAddress("");
    setPaymentTermDays("7");
    setBuyerType("PABRIK");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !contactName || !phone || !billingAddress) {
      setError("Nama Restoran, Kontak, No HP, dan Alamat Tagihan wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await createCustomerAction({
      name,
      contactName,
      phone,
      email: email || undefined,
      billingAddress,
      paymentTermDays: parseInt(paymentTermDays) || 7,
      buyerType,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      toast.success(res.message || "Restoran berhasil ditambahkan");
      resetForm();
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} className="cursor-pointer">
        <Plus className="w-4 h-4 mr-1.5" />
        Tambah pabrik / pembeli
      </Button>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah pabrik / pembeli</DialogTitle>
          <DialogDescription>
            Masukkan pabrik, pasar, atau perorangan yang membeli barang.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Jenis pembeli</label>
            <select value={buyerType} onChange={(e) => setBuyerType(e.target.value as typeof buyerType)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
              <option value="PABRIK">Pabrik</option>
              <option value="PASAR">Pasar</option>
              <option value="PERORANGAN">Perorangan</option>
              <option value="LAINNYA">Lainnya</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Nama pabrik / pembeli <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Restoran Ocean Seafood Jakarta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Nama Kontak PIC <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Chef Budi"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                No HP / WhatsApp <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="081234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Email (Opsional)
            </label>
            <Input
              type="email"
              placeholder="finance@oceanseafood.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Alamat Tagihan <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Jl. Pantai Indah Kapuk No. 8, Jakarta Utara"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Termin Pembayaran (Hari Jatuh Tempo)
            </label>
            <Input
              type="number"
              min="1"
              placeholder="7"
              value={paymentTermDays}
              onChange={(e) => setPaymentTermDays(e.target.value)}
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
              Simpan pabrik / pembeli
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
