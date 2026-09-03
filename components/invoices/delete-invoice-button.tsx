"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteInvoiceAction } from "@/lib/actions/invoices";
import { toast } from "sonner";
import type { InvoiceStatus } from "@/types";

interface DeleteInvoiceButtonProps {
  invoiceId: string;
  invoiceNumber?: string | null;
  status: InvoiceStatus;
  customerName: string;
}

export function DeleteInvoiceButton({ invoiceId, invoiceNumber, status, customerName }: DeleteInvoiceButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setLoading(true);
    const res = await deleteInvoiceAction(invoiceId);
    setLoading(false);
    if (res.error) {
      toast.error(`Gagal: ${res.error}`);
      setOpen(false);
    } else {
      toast.success(res.message ?? "Invoice berhasil dihapus.");
      router.push("/invoices");
    }
  };

  const isDraft = status === "DRAFT";
  const description = isDraft
    ? `Hapus draft invoice untuk ${customerName}? Tindakan ini tidak dapat dibatalkan.`
    : `Hapus invoice ${invoiceNumber ?? ""} (${customerName})? Stok akan dikembalikan, semua pembayaran akan dihapus, dan statistik akan diperbarui. Tindakan ini tidak dapat dibatalkan.`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "rounded-xl border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 shadow-sm",
        })}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        {isDraft ? "Hapus Draft" : "Hapus Invoice"}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={(o) => { if (!loading) setOpen(o); }}
        title={isDraft ? "Hapus Draft?" : "Hapus Invoice Permanen?"}
        description={description}
        confirmLabel={loading ? "Menghapus..." : isDraft ? "Hapus Draft" : "Ya, Hapus Invoice"}
        onConfirm={handleDelete}
      />
    </>
  );
}
