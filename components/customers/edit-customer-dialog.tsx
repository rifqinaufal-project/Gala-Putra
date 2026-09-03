"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { updateCustomerAction } from "@/lib/actions/customers";
import type { Customer } from "@/types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface EditCustomerDialogProps {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
}: EditCustomerDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(customer.name);
  const [contactName, setContactName] = useState(customer.contactName);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email || "");
  const [billingAddress, setBillingAddress] = useState(customer.billingAddress);
  const [paymentTermDays, setPaymentTermDays] = useState(
    String(customer.paymentTermDays || 7)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !contactName || !phone || !billingAddress) {
      setError("Nama Restoran, Kontak, No HP, dan Alamat Tagihan wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await updateCustomerAction({
      id: customer.id,
      name,
      contactName,
      phone,
      email: email || undefined,
      billingAddress,
      paymentTermDays: parseInt(paymentTermDays) || 7,
      status: customer.status,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      toast.success(res.message || "Restoran berhasil diperbarui");
      onOpenChange(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Restoran Pelanggan</DialogTitle>
          <DialogDescription>
            Perbarui profil restoran dan kontak penanggung jawab.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Nama Restoran <span className="text-red-500">*</span>
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Nama Kontak PIC <span className="text-red-500">*</span>
              </label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                No HP / WhatsApp <span className="text-red-500">*</span>
              </label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Email (Opsional)
            </label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Alamat Tagihan <span className="text-red-500">*</span>
            </label>
            <Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Termin Pembayaran (Hari Jatuh Tempo)
            </label>
            <Input type="number" min="1" value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)} />
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
