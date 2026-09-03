import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import Link from "next/link";
import { getCustomersAction } from "@/lib/actions/customers";
import { getProductsAction } from "@/lib/actions/products";
import { getCustomerPricesAction } from "@/lib/actions/pricing";
import { requireApprovedUser } from "@/lib/security/auth";

export const metadata: Metadata = {
  title: "Buat Invoice",
};

export default async function NewInvoicePage() {
  const user = await requireApprovedUser();
  const [customers, products, customerPrices] = await Promise.all([
    getCustomersAction(),
    getProductsAction(),
    getCustomerPricesAction(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 border-b border-border/70 pb-5">
        <Link
          href="/invoices"
          aria-label="Kembali ke daftar invoice"
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
            Buat Invoice
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Susun detail pesanan, biaya, dan termin pembayaran restoran.
          </p>
        </div>
      </div>

      <InvoiceForm customers={customers} products={products} customerPrices={customerPrices} canViewInternal={user.role !== "STAFF"} />
    </div>
  );
}
