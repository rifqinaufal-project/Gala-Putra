"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { forceDeleteStockReceiptAction } from "@/lib/actions/inventory";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface CancelStockReceiptDialogProps {
  receiptId?: string;
  receiptNumber?: string;
}

export function CancelStockReceiptDialog({ receiptId, receiptNumber }: CancelStockReceiptDialogProps) {
  const router = useRouter();
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);

  if (!receiptId) return null;

  const forceDeleteReceipt = async () => {
    const result = await forceDeleteStockReceiptAction(receiptId);
    if ("error" in result && result.error) { toast.error(`Gagal: ${result.error}`); return; }
    toast.success("message" in result ? result.message : "Pembelian supplier berhasil dihapus.");
    setForceDeleteOpen(false);
    router.refresh();
  };

  return <>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setForceDeleteOpen(true)}
      className="h-8 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
      aria-label={`Hapus penerimaan ${receiptNumber || "stok"}`}
    >
      <Trash2 className="mr-1.5 size-3.5" /> Hapus
    </Button>
    <ConfirmDialog
      open={forceDeleteOpen}
      onOpenChange={setForceDeleteOpen}
      title="Hapus pembelian supplier?"
      description={`${receiptNumber || "Penerimaan ini"} dan seluruh item di dalamnya akan dihapus permanen.`}
      confirmLabel="Hapus permanen"
      onConfirm={forceDeleteReceipt}
    />
  </>;
}
