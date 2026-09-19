"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteLoadAction, forceDeleteLoadAction } from "@/lib/actions/loads";
import type { Load, Role } from "@/types";
import { useState } from "react";

export function LoadRowActions({ load, role }: { load: Load; role: Role }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canForceDelete = role === "OWNER" && load.status === "RECONCILED";
  const destructiveNote = canForceDelete
    ? "Muatan yang sudah direkonsiliasi akan dihapus permanen. Histori rekonsiliasi, invoice, pembayaran, dan hutang sumber ikut dihapus, tetapi saldo stok reject yang tersisa tetap dipertahankan."
    : "Muatan yang sudah direkonsiliasi atau memiliki pembayaran tidak dapat dihapus.";

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link href={`/loads/${load.id}/edit`} className={buttonVariants({ variant: "outline", size: "icon-xs" })} aria-label={`Edit ${load.loadNumber}`} title="Edit muatan">
        <Pencil />
      </Link>
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => setConfirmOpen(true)} className="text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label={`Hapus ${load.loadNumber}`} title="Hapus muatan">
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={canForceDelete ? "Hapus muatan permanen?" : "Hapus muatan?"}
        description={
          canForceDelete
            ? `Muatan ${load.loadNumber}, rekonsiliasi, invoice, pembayaran, hutang sumber, serta histori reject terkait akan dihapus permanen. Saldo stok reject yang tersisa tetap dipertahankan.`
            : `Muatan ${load.loadNumber}, invoice pabrik, dan hutang sumber yang belum dibayar akan dihapus.`
        }
        confirmLabel={canForceDelete ? "Hapus permanen" : "Hapus muatan"}
        confirmationText={canForceDelete ? "HAPUS" : undefined}
        note={destructiveNote}
        onConfirm={async () => {
          const result = canForceDelete
            ? await forceDeleteLoadAction(load.id)
            : await deleteLoadAction(load.id);
          if (result.error) {
            toast.error(`Gagal: ${result.error}`);
            return;
          }
          toast.success("message" in result ? result.message : "Muatan berhasil dihapus.");
          router.refresh();
        }}
      />
    </div>
  );
}
