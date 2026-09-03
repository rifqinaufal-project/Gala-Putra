import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ReconcileLoadForm } from "@/components/loads/reconcile-load-form";
import { buttonVariants } from "@/components/ui/button";
import { getLoadByIdAction } from "@/lib/actions/loads";
import { requireRole } from "@/lib/security/auth";
import { notFound, redirect } from "next/navigation";
export const metadata: Metadata = { title: "Rekonsiliasi pabrik" };
export default async function ReconcilePage({ params }: { params: Promise<{ id: string }> }) { await requireRole(["OWNER", "FINANCE"]); const { id } = await params; const load = await getLoadByIdAction(id); if (!load) notFound(); if (load.status !== "DISPATCHED") redirect(`/loads/${id}`); return <div className="space-y-6"><PageHeader title="Catat hasil pabrik" description={`${load.loadNumber} · ${load.destinationName}`}><Link href={`/loads/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft className="mr-1.5 size-4" />Kembali</Link></PageHeader><ReconcileLoadForm load={load} /></div>; }
