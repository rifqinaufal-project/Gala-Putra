import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus, Scale } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { LoadListTable } from "@/components/loads/load-list-table";
import { LoadChart } from "@/components/loads/load-chart";
import { getLoadsAction } from "@/lib/actions/loads";
import { formatWeightKg } from "@/lib/domain/weights";
import { requireRole } from "@/lib/security/auth";

export const metadata: Metadata = { title: "Muatan" };
export default async function LoadsPage() { await requireRole(["OWNER", "FINANCE"]); const loads = await getLoadsAction(); const dispatched = loads.filter((load) => load.status === "DISPATCHED").length; const totalKg = loads.reduce((total, load) => total + load.totalQuantityKg, 0); const rejectedKg = loads.reduce((total, load) => total + (load.totalRejectedKg ?? 0), 0); return <div className="space-y-6"><PageHeader title="Muatan ke pabrik" description="Catat pengambilan ikan dari banyak TPI dan pengiriman langsung ke pabrik."><Link href="/loads/new" className={buttonVariants({ size: "sm" })}><Plus className="mr-1.5 size-4" />Buat muatan</Link></PageHeader><div className="grid gap-3 min-[500px]:grid-cols-3"><MetricCard title="Total muatan" value={loads.length} suffix="transaksi" icon={ClipboardList} accent="sky" /><MetricCard title="Berat terkirim" value={formatWeightKg(totalKg)} icon={Scale} accent="emerald" /><MetricCard title="Menunggu hasil" value={dispatched} suffix={`${formatWeightKg(rejectedKg)} reject tercatat`} icon={Scale} accent="amber" /></div><LoadChart loads={loads} /><LoadListTable loads={loads} /></div>; }
