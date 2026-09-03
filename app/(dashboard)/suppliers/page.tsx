import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { getSuppliersAction } from "@/lib/actions/suppliers";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SupplierTable } from "@/components/suppliers/supplier-table";
import { requireApprovedUser } from "@/lib/security/auth";

export const metadata: Metadata = {
  title: "TPI & sumber",
};

export default async function SuppliersPage() {
  const [suppliers, user] = await Promise.all([getSuppliersAction(), requireApprovedUser()]);
  const canManage = user.role !== "STAFF";

  return (
    <div className="space-y-6">
      <PageHeader
        title="TPI & sumber"
        description="Kelola TPI dan perorangan tempat Gala membeli ikan"
      >
        {canManage && <AddSupplierDialog />}
      </PageHeader>

      <SupplierTable suppliers={suppliers} canManage={canManage} />
    </div>
  );
}
