"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { finalizeLoadReconciliationAction } from "@/lib/actions/reconciliation";
import { formatWeightKg } from "@/lib/domain/weights";
import type { Load } from "@/types";

export function ReconcileLoadForm({ load }: { load: Load }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState(() => load.items.reduce<Array<{ productId: string; productName: string; sentQuantityKg: number; acceptedQuantityKg: number; rejectedQuantityKg: number; rejectQuality: string; rejectNotes: string }>>((result, item) => {
    const existing = result.find((entry) => entry.productId === item.productId);
    if (existing) existing.sentQuantityKg += item.quantityKg;
    else result.push({ productId: item.productId, productName: `${item.productName}${item.productSize ? ` [${item.productSize}]` : ""}`, sentQuantityKg: item.quantityKg, acceptedQuantityKg: item.quantityKg, rejectedQuantityKg: 0, rejectQuality: "", rejectNotes: "" });
    return result;
  }, []));
  const update = (productId: string, field: string, value: string) => setItems((current) => current.map((item) => item.productId === productId ? { ...item, [field]: value === "" ? "" : Number(value) } : item));
  const totalAccepted = items.reduce((total, item) => total + Number(item.acceptedQuantityKg || 0), 0);
  const totalRejected = items.reduce((total, item) => total + Number(item.rejectedQuantityKg || 0), 0);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    const result = await finalizeLoadReconciliationAction(load.id, { reconciliationDate: date, notes: notes || undefined, items: items.map((item) => ({ productId: item.productId, acceptedQuantityKg: Number(item.acceptedQuantityKg), rejectedQuantityKg: Number(item.rejectedQuantityKg), rejectQuality: item.rejectQuality, rejectNotes: item.rejectNotes })) });
    setSaving(false);
    if ("error" in result) { toast.error(`Gagal: ${result.error}`); return; }
    toast.success(result.message); router.push(`/loads/${load.id}`); router.refresh();
  };
  return <form onSubmit={submit} className="space-y-5"><section className="erp-surface overflow-hidden"><div className="flex items-start gap-3 border-b border-border bg-muted/30 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Scale className="size-5" /></div><div><h2 className="text-sm font-semibold">Hasil penerimaan pabrik</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Pastikan berat diterima dan reject sesuai hasil akhir pabrik. Rekonsiliasi hanya dapat difinalisasi satu kali.</p></div></div><div className="divide-y divide-border">{items.map((item) => <div key={item.productId} className="space-y-4 p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold">{item.productName}</p><p className="text-xs text-muted-foreground">Dikirim {formatWeightKg(item.sentQuantityKg)}</p></div><div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><label className="text-xs font-semibold">Diterima baik (kg)</label><Input required min="0" step="0.001" type="number" value={item.acceptedQuantityKg} onChange={(event) => update(item.productId, "acceptedQuantityKg", event.target.value)} className="h-10 rounded-xl text-right tabular-nums" /></div><div className="space-y-1.5"><label className="text-xs font-semibold">Reject (kg)</label><Input required min="0" step="0.001" type="number" value={item.rejectedQuantityKg} onChange={(event) => update(item.productId, "rejectedQuantityKg", event.target.value)} className="h-10 rounded-xl text-right tabular-nums" /></div></div><div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><label className="text-xs font-semibold">Kualitas / alasan reject</label><Input value={item.rejectQuality} onChange={(event) => update(item.productId, "rejectQuality", event.target.value)} placeholder="Ukuran tidak sesuai, rusak, kualitas turun" className="h-10 rounded-xl" /></div><div className="space-y-1.5"><label className="text-xs font-semibold">Catatan</label><Input value={item.rejectNotes} onChange={(event) => update(item.productId, "rejectNotes", event.target.value)} placeholder="Opsional" className="h-10 rounded-xl" /></div></div><p className={Number(item.acceptedQuantityKg || 0) + Number(item.rejectedQuantityKg || 0) > item.sentQuantityKg ? "text-xs font-medium text-red-600" : "text-xs text-muted-foreground"}>Terhitung {formatWeightKg(Number(item.acceptedQuantityKg || 0) + Number(item.rejectedQuantityKg || 0))}</p></div>)}</div></section><section className="erp-surface grid gap-4 p-5 md:grid-cols-2"><div className="space-y-1.5"><label className="text-xs font-semibold">Tanggal rekonsiliasi</label><Input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded-xl" /></div><div className="space-y-1.5"><label className="text-xs font-semibold">Catatan umum</label><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan dari pabrik" className="h-10 rounded-xl" /></div></section><section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm"><span className="text-emerald-800/70">Total diterima</span><strong className="text-emerald-950">{formatWeightKg(totalAccepted)}</strong><span className="text-emerald-800/70">Total reject</span><strong className="text-emerald-950">{formatWeightKg(totalRejected)}</strong></div><Button type="submit" disabled={saving} className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-800">{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}Finalisasi hasil pabrik</Button></section></form>;
}
