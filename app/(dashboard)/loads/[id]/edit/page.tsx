import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadForm } from "@/components/loads/load-form";
import { buttonVariants } from "@/components/ui/button";
import { getCustomersAction } from "@/lib/actions/customers";
import { getLoadByIdAction } from "@/lib/actions/loads";
import { getProductsAction } from "@/lib/actions/products";
import { getSuppliersAction } from "@/lib/actions/suppliers";
import { requireRole } from "@/lib/security/auth";

export const metadata: Metadata = { title: "Edit muatan" };

export default async function EditLoadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["OWNER", "FINANCE"]);
  const { id } = await params;
  const [load, products, suppliers, customers] = await Promise.all([
    getLoadByIdAction(id),
    getProductsAction(),
    getSuppliersAction(),
    getCustomersAction(),
  ]);
  if (!load) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${load.loadNumber}`} description="Perbarui ikan, sumber, harga, biaya, atau pabrik tujuan sebelum rekonsiliasi.">
        <Link href={`/loads/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft className="mr-1.5 size-4" />Kembali</Link>
      </PageHeader>
      <LoadForm initialData={load} products={products} suppliers={suppliers} customers={customers} />
    </div>
  );
}
