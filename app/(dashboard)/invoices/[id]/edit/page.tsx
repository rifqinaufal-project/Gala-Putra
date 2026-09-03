import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import Link from "next/link";
import { getCustomersAction } from "@/lib/actions/customers";
import { getProductsAction } from "@/lib/actions/products";
import { getCustomerPricesAction } from "@/lib/actions/pricing";
import { getInvoiceByIdAction } from "@/lib/actions/invoices";
import { requireApprovedUser } from "@/lib/security/auth";

export const metadata: Metadata = {
  title: "Edit Invoice",
};

export default async function EditInvoicePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireApprovedUser();

  // Only OWNER and FINANCE can edit
  if (!["OWNER","FINANCE"].includes(user.role)) redirect(`/invoices/${id}`);

  const [invoice, customers, products, customerPrices] = await Promise.all([
    getInvoiceByIdAction(id),
    getCustomersAction(),
    getProductsAction(),
    getCustomerPricesAction(),
  ]);

  if (!invoice) notFound();

  // VOID and DRAFT should not be edited via this page
  if (invoice.status === "VOID" || invoice.status === "DRAFT") {
    redirect(`/invoices/${id}`);
  }

  const initialData = {
    id: invoice.id,
    customerId: invoice.customerId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate ?? "",
    notes: invoice.notes ?? "",
    discount: invoice.discount,
    items: invoice.items.map((item) => ({
      productId: item.productId ?? "",
      description: item.descriptionSnapshot,
      quantity: item.quantity,
      marginQuantity: item.marginQuantity ?? 0,
      unit: item.unit,
      sellingPrice: item.sellingPriceSnapshot,
      purchasePrice: item.purchasePriceSnapshot ?? 0,
    })),
    costs: invoice.directCosts?.map((cost) => ({
      category: cost.category,
      name: cost.name,
      amount: cost.amount,
      notes: cost.notes ?? "",
    })) ?? [],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 border-b border-black/[0.06] pb-5">
        <Link
          href={`/invoices/${id}`}
          aria-label="Kembali ke detail invoice"
          className={buttonVariants({
            variant: "outline",
            size: "icon",
            className: "mt-0.5 h-9 w-9 rounded-xl bg-white shadow-sm",
          })}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Invoice Penjualan
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Edit Invoice {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : ""}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Perubahan akan menghitung ulang total, sisa tagihan, dan margin secara otomatis.
          </p>
        </div>
      </div>

      <InvoiceForm
        customers={customers}
        products={products}
        customerPrices={customerPrices}
        canViewInternal={user.role !== "STAFF"}
        initialData={initialData}
      />
    </div>
  );
}
