"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteLoadAction } from "@/lib/actions/loads";
import type { Load } from "@/types";
import { useState } from "react";

export function LoadRowActions({ load }: { load: Load }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
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
        title="Hapus muatan?"
        description={`Muatan ${load.loadNumber}, invoice pabrik, dan hutang sumber yang belum dibayar akan dihapus.`}
        confirmLabel="Hapus muatan"
        note="Muatan yang sudah direkonsiliasi atau memiliki pembayaran tidak dapat dihapus."
        onConfirm={async () => {
          const result = await deleteLoadAction(load.id);
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
