"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/utils";
import { formatWeightKg, formatWeightTon } from "@/lib/domain/weights";
import type { Load } from "@/types";
import { LoadRowActions } from "@/components/loads/load-row-actions";

function statusLabel(status: Load["status"]) {
  if (status === "RECONCILED") return "Selesai";
  if (status === "DISPATCHED") return "Menunggu hasil";
  return status;
}

export function LoadListTable({ loads }: { loads: Load[] }) {
  if (!loads.length) {
    return <div className="erp-surface"><EmptyState icon={ClipboardList} title="Belum ada muatan" description="Buat muatan pertama untuk mencatat ikan dari TPI sampai ke pabrik." actionLabel="Buat muatan" actionHref="/loads/new" /></div>;
  }

  return (
    <div className="erp-surface overflow-hidden">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-semibold">Muatan</th>
              <th className="px-5 py-3 font-semibold">Pabrik</th>
              <th className="px-5 py-3 font-semibold">Berat</th>
              <th className="px-5 py-3 font-semibold">Reject</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loads.map((load) => (
              <tr key={load.id} className="hover:bg-muted/20">
                <td className="px-5 py-4"><p className="font-semibold">{load.loadNumber}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateShort(load.loadDate)} · {load.items.length} item</p></td>
                <td className="px-5 py-4">{load.destinationName}</td>
                <td className="px-5 py-4"><p className="font-medium tabular-nums">{formatWeightKg(load.totalQuantityKg)}</p><p className="text-xs text-muted-foreground">{formatWeightTon(load.totalQuantityKg)}</p></td>
                <td className="px-5 py-4 tabular-nums">{load.totalRejectedKg == null ? "Belum direkonsiliasi" : formatWeightKg(load.totalRejectedKg)}</td>
                <td className="px-5 py-4"><Badge variant={load.status === "RECONCILED" ? "default" : "secondary"}>{statusLabel(load.status)}</Badge></td>
                <td className="px-5 py-4"><div className="flex items-center justify-end gap-3"><Link href={`/loads/${load.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Detail <ArrowUpRight className="size-3.5" /></Link><LoadRowActions load={load} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border lg:hidden">
        {loads.map((load) => (
          <article key={load.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/loads/${load.id}`} className="min-w-0"><p className="text-sm font-semibold">{load.loadNumber}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateShort(load.loadDate)} · {load.destinationName}</p></Link>
              <Badge variant={load.status === "RECONCILED" ? "default" : "secondary"}>{statusLabel(load.status)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-3 text-xs">
              <div><p className="text-muted-foreground">Berat terkirim</p><p className="mt-1 font-semibold tabular-nums">{formatWeightKg(load.totalQuantityKg)}</p></div>
              <div className="text-right"><p className="text-muted-foreground">Reject</p><p className="mt-1 font-semibold tabular-nums">{load.totalRejectedKg == null ? "Belum" : formatWeightKg(load.totalRejectedKg)}</p></div>
            </div>
            <div className="flex items-center justify-between gap-3"><Link href={`/loads/${load.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Lihat detail <ArrowUpRight className="size-3.5" /></Link><LoadRowActions load={load} /></div>
          </article>
        ))}
      </div>
    </div>
  );
}
