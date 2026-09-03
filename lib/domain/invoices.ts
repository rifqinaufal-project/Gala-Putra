import type { Invoice, InvoiceStatus, PublicInvoice } from "@/types";

export function getEffectiveInvoiceStatus(status: InvoiceStatus, dueDate?: string, today = new Date()): InvoiceStatus {
  if ((status === "ISSUED" || status === "PARTIALLY_PAID") && dueDate) {
    const due = new Date(`${dueDate}T23:59:59`);
    if (due.getTime() < today.getTime()) return "OVERDUE";
  }
  return status;
}

export function isPublicInvoice(value: unknown): value is PublicInvoice {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.publicToken === "string" && typeof row.invoiceNumber === "string" &&
    typeof row.customerName === "string" && Array.isArray(row.items) && !!row.company && typeof row.company === "object";
}

export function sanitizeInvoiceForRole(invoice: Invoice, canViewInternal: boolean): Invoice {
  if (canViewInternal) return invoice;
  return {
    ...invoice,
    totalProductCost: 0,
    totalDirectCost: 0,
    productProfit: 0,
    transactionProfit: 0,
    transactionMargin: 0,
    directCosts: [],
    items: invoice.items.map((item) => ({
      ...item,
      purchasePriceSnapshot: 0,
      totalPurchaseCost: 0,
      productProfit: 0,
    })),
  };
}
