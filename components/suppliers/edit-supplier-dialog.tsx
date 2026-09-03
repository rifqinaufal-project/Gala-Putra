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
import { updateSupplierAction } from "@/lib/actions/suppliers";
import type { Supplier } from "@/types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface EditSupplierDialogProps {
  supplier: Supplier;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSupplierDialog({
  supplier,
  open,
  onOpenChange,
}: EditSupplierDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(supplier.name);
  const [contactName, setContactName] = useState(supplier.contactName);
  const [phone, setPhone] = useState(supplier.phone);
  const [address, setAddress] = useState(supplier.address);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !contactName || !phone || !address) {
      setError("Semua field wajib diisi.");
      return;
    }

    setLoading(true);

    const res = await updateSupplierAction({
      id: supplier.id,
      name,
      contactName,
      phone,
      address,
      status: supplier.status,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      toast.success(res.message || "Supplier berhasil diperbarui");
      onOpenChange(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Supplier Seafood</DialogTitle>
          <DialogDescription>
            Perbarui data nelayan atau pemasok grosir seafood.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Nama Supplier / PT <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Kontak PIC <span className="text-red-500">*</span>
              </label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="h-10 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                No HP / WhatsApp <span className="text-red-500">*</span>
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Alamat Pelabuhan / Kantor <span className="text-red-500">*</span>
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-10 text-sm"
              required
            />
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
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
