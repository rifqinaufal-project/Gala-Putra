"use client";

import { useState } from "react";
import type { Supplier } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { MoreHorizontal, Edit, Power, Trash2, Loader2, DollarSign, Users } from "lucide-react";
import { toggleSupplierStatusAction, deleteSupplierAction } from "@/lib/actions/suppliers";
import { EditSupplierDialog } from "./edit-supplier-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

interface SupplierTableProps {
  suppliers: Supplier[];
  canManage?: boolean;
}

export function SupplierTable({ suppliers, canManage = false }: SupplierTableProps) {
  const router = useRouter();
  const [suppliersList, setSuppliersList] = useState<Supplier[]>(suppliers);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggleStatus = async (supplier: Supplier) => {
    setLoadingId(supplier.id);
    const res = await toggleSupplierStatusAction(supplier.id, supplier.status);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal: ${res.error}`);
    } else {
      toast.success(res.message || "Status supplier berhasil diperbarui");
      router.refresh();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSupplier) return;
    const idToDelete = deletingSupplier.id;
    setLoadingId(idToDelete);

    // Optimistic update
    setSuppliersList((prev) => prev.filter((s) => s.id !== idToDelete));
    setDeletingSupplier(null);

    const res = await deleteSupplierAction(idToDelete);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal menghapus: ${res.error}`);
      // Revert optimistic update
      setSuppliersList(suppliers);
    } else {
      toast.success(res.message || "Supplier berhasil dihapus");
      if (res.isWarning) {
        // If warning, status was changed instead of deleted, so we should refresh
        router.refresh();
      } else {
        router.refresh();
      }
    }
  };

  const renderActions = (supplier: Supplier) => {
    if (!canManage) return null;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-stone-100 hover:text-foreground"
          aria-label={`Aksi untuk ${supplier.name}`}
        >
          {loadingId === supplier.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="cursor-pointer" onClick={() => setEditingSupplier(supplier)}>
            <Edit className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Edit Supplier
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer">
            <Link href="/pricing/purchase" className="flex w-full items-center">
              <DollarSign className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Riwayat Harga
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleToggleStatus(supplier)}>
            <Power className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            {supplier.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-red-600 focus:text-red-600"
            onClick={() => setDeletingSupplier(supplier)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5 text-red-600" />
            Hapus Supplier
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <>
      <div className="erp-surface overflow-hidden">
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold">Nama Supplier</TableHead>
                <TableHead className="text-xs font-semibold">Kontak</TableHead>
                <TableHead className="text-xs font-semibold">Telepon</TableHead>
                <TableHead className="text-xs font-semibold">Alamat</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliersList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48">
                    <EmptyState
                      icon={Users}
                      title="Tidak ada supplier"
                      description="Belum ada data supplier yang terdaftar."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                suppliersList.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/20">
                    <TableCell className="text-sm font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm">{s.contactName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.phone}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {s.address}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.status === "ACTIVE" ? "default" : "secondary"}
                        className="text-[11px]"
                      >
                        {s.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    {canManage && <TableCell>{renderActions(s)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="divide-y divide-border lg:hidden">
          {suppliersList.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Users}
                title="Tidak ada supplier"
                description="Belum ada data supplier yang terdaftar."
              />
            </div>
          ) : (
            suppliersList.map((supplier) => (
              <article key={supplier.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-stone-900">{supplier.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{supplier.contactName || "Kontak belum diisi"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={supplier.status === "ACTIVE" ? "default" : "secondary"} className="text-[11px]">
                      {supplier.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                    </Badge>
                    {renderActions(supplier)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Telepon</p>
                    <p className="mt-1 font-medium text-foreground">{supplier.phone || "—"}</p>
                  </div>
                  <div className="border-l border-border pl-3">
                    <p className="text-muted-foreground">Alamat</p>
                    <p className="mt-1 line-clamp-2 font-medium leading-relaxed text-foreground">{supplier.address || "—"}</p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {suppliersList.length} supplier
          </p>
        </div>
      </div>

      {canManage && editingSupplier && (
        <EditSupplierDialog
          supplier={editingSupplier}
          open={!!editingSupplier}
          onOpenChange={(open) => {
            if (!open) setEditingSupplier(null);
          }}
        />
      )}

      {deletingSupplier && (
        <ConfirmDialog
          open={!!deletingSupplier}
          onOpenChange={(open) => {
            if (!open) setDeletingSupplier(null);
          }}
          title="Hapus Supplier?"
          description={`Apakah Anda yakin ingin menghapus data supplier "${deletingSupplier.name}"?`}
          confirmLabel="Hapus Supplier"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
