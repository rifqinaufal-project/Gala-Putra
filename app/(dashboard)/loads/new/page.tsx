import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadForm } from "@/components/loads/load-form";
import { buttonVariants } from "@/components/ui/button";
import { getCustomersAction } from "@/lib/actions/customers";
import { getProductsAction } from "@/lib/actions/products";
import { getSuppliersAction } from "@/lib/actions/suppliers";
import { requireRole } from "@/lib/security/auth";
export const metadata: Metadata = { title: "Buat muatan" };
export default async function NewLoadPage() { await requireRole(["OWNER", "FINANCE"]); const [products, suppliers, customers] = await Promise.all([getProductsAction(), getSuppliersAction(), getCustomersAction()]); return <div className="space-y-6"><PageHeader title="Buat muatan" description="Timbang ikan dari beberapa sumber, pilih pabrik tujuan, lalu buat invoice pengiriman."><Link href="/loads" className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft className="mr-1.5 size-4" />Kembali</Link></PageHeader><LoadForm products={products} suppliers={suppliers} customers={customers} /></div>; }
