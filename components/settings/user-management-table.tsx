"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User, Info, CheckCircle2, XCircle, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { approveUserAction, rejectUserAction, type SystemUserItem } from "@/lib/actions/users";
import type { Role } from "@/types";

interface UserManagementTableProps {
  users: SystemUserItem[];
  currentUserRole: string;
}

const roleLabel: Record<string, string> = {
  OWNER: "Owner (Akses Penuh)",
  FINANCE: "Admin & Keuangan",
  STAFF: "Staff Operasional",
};

export function UserManagementTable({ users, currentUserRole }: UserManagementTableProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const pendingUsers = users.filter((u) => u.status === "PENDING");
  const activeUsers = users.filter((u) => u.status === "APPROVED");
  const rejectedUsers = users.filter((u) => u.status === "REJECTED");

  const isOwner = currentUserRole.toUpperCase() === "OWNER";

  const handleApprove = async (user: SystemUserItem, role: Role) => {
    setLoadingId(user.id);
    const res = await approveUserAction(user.id, role);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal menyetujui: ${res.error}`);
    } else {
      toast.success(res.message || `Akun ${user.name} berhasil disetujui.`);
      router.refresh();
    }
  };

  const handleReject = async (user: SystemUserItem) => {
    setLoadingId(user.id);
    const res = await rejectUserAction(user.id);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal menolak: ${res.error}`);
    } else {
      toast.info(res.message || `Pendaftaran ${user.name} telah ditolak.`);
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <section className="border-y border-border" aria-labelledby="pending-access-title">
        <div className="flex items-end justify-between gap-5 py-5">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Akses pengguna</p>
            <h3 id="pending-access-title" className="mt-1 text-lg font-semibold tracking-[-0.025em] text-foreground">Permintaan akses</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Tinjau akun baru sebelum memberikan akses ke data operasional ERP.</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-2xl font-medium leading-none text-foreground tabular-nums">{String(pendingUsers.length).padStart(2, "0")}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">menunggu</p>
          </div>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="flex items-baseline gap-4 border-t border-border py-8">
            <span className="font-mono text-xs text-muted-foreground">00</span>
            <div>
              <p className="text-sm font-medium text-foreground">Tidak ada akun untuk ditinjau</p>
              <p className="mt-1 text-xs text-muted-foreground">Semua permintaan pendaftaran sudah diproses.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {pendingUsers.map((user, index) => (
              <article key={user.id} className="grid gap-4 py-5 xl:grid-cols-[2rem_minmax(0,1fr)_13rem_auto] xl:items-center">
                <span className="hidden font-mono text-[11px] text-muted-foreground xl:block">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{user.name}</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs xl:block">
                  <div>
                    <p className="text-muted-foreground">Akses awal</p>
                    <p className="mt-1 font-medium text-foreground">{roleLabel[user.role] || user.role}</p>
                  </div>
                  <div className="xl:mt-3">
                    <p className="text-muted-foreground">Mendaftar</p>
                    <p className="mt-1 font-medium text-foreground">{user.createdAt}</p>
                  </div>
                </div>
                {isOwner ? (
                  <div className="flex flex-col gap-2 min-[430px]:flex-row min-[430px]:flex-wrap xl:justify-end">
                    <Button size="sm" onClick={() => handleApprove(user, "STAFF")} disabled={loadingId === user.id} className="w-full min-[430px]:w-auto">Setujui sebagai staff</Button>
                    <Button size="sm" variant="outline" onClick={() => handleApprove(user, "FINANCE")} disabled={loadingId === user.id} className="w-full min-[430px]:w-auto">Jadikan finance</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleReject(user)} disabled={loadingId === user.id} className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 min-[430px]:w-auto">
                      <X className="size-3.5" /> Tolak
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground xl:justify-end"><ShieldAlert className="size-3.5" /> Hanya Owner yang dapat menyetujui akun.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Registered & Active Users Table */}
      <div className="erp-surface space-y-0 overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <User className="size-4 text-muted-foreground" />
              Pengguna aktif
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Akun yang sudah memiliki hak akses ke ERP.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            <span><b className="text-foreground">{activeUsers.length}</b> pengguna</span>
          </div>
        </div>

        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold">Nama / Pengguna</TableHead>
                <TableHead className="text-xs font-semibold">Email Supabase</TableHead>
                <TableHead className="text-xs font-semibold">Role Akses</TableHead>
                <TableHead className="text-xs font-semibold">Terdaftar</TableHead>
                <TableHead className="text-xs font-semibold text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeUsers.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/20">
                  <TableCell className="text-sm font-semibold text-slate-900">
                    {u.name}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 font-mono">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        u.role === "OWNER"
                          ? "border border-neutral-300 bg-neutral-100 text-neutral-900 text-xs"
                          : "bg-slate-100 text-slate-700 text-xs"
                      }
                    >
                      {roleLabel[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.createdAt}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800">
                      <CheckCircle2 className="size-3" />
                      Aktif
                    </span>
                  </TableCell>
                </TableRow>
              ))}

              {rejectedUsers.map((u) => (
                <TableRow key={u.id} className="bg-red-50/30 hover:bg-red-50/40 opacity-75">
                  <TableCell className="text-sm font-semibold text-slate-700 line-through">
                    {u.name}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500 font-mono">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs text-slate-500 border-slate-300">
                      {roleLabel[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.createdAt}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      <XCircle className="w-3 h-3 text-red-600" />
                      Ditolak
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="divide-y divide-stone-200 sm:hidden">
          {[...activeUsers, ...rejectedUsers].map((user) => {
            const isRejected = user.status === "REJECTED";
            return (
              <article key={user.id} className={`space-y-3 p-4 ${isRejected ? "bg-red-50/30" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${isRejected ? "text-slate-600 line-through" : "text-slate-900"}`}>{user.name}</p>
                    <p className="mt-1 break-all text-xs text-slate-600">{user.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium ${isRejected ? "border-red-200 bg-red-50 text-red-700" : "border-neutral-300 bg-neutral-100 text-neutral-800"}`}>
                    {isRejected ? "Ditolak" : "Aktif"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-stone-50 p-3 text-xs">
                  <div><p className="text-stone-500">Role akses</p><p className="mt-1 font-medium text-stone-800">{roleLabel[user.role] || user.role}</p></div>
                  <div className="text-right"><p className="text-stone-500">Terdaftar</p><p className="mt-1 font-medium text-stone-800">{user.createdAt}</p></div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
