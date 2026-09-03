import {
  formatCurrency,
  formatDateShort,
} from "@/lib/utils";
import type { Invoice } from "@/types";
import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { AlertCircle } from "lucide-react";

interface OutstandingInvoiceCardProps {
  invoices: Invoice[];
}

export function OutstandingInvoiceCard({
  invoices,
}: OutstandingInvoiceCardProps) {
  const outstanding = invoices.filter(
    (inv) =>
      inv.status === "ISSUED" ||
      inv.status === "PARTIALLY_PAID" ||
      inv.status === "OVERDUE"
  );

  const totalOutstanding = outstanding.reduce(
    (sum, inv) => sum + inv.remainingBalance,
    0
  );
  const overdueCount = outstanding.filter(
    (inv) => inv.status === "OVERDUE"
  ).length;

  return (
    <div className="erp-surface overflow-hidden">
      <div className="flex items-start justify-between border-b border-border p-5">
        <div>
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">
            Invoice Belum Lunas
          </p>
          <p className="text-xl font-bold text-foreground">
            {formatCurrency(totalOutstanding)}
          </p>
          {overdueCount > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span className="text-xs text-red-600 font-medium">
                {overdueCount} invoice jatuh tempo
              </span>
            </div>
          )}
        </div>
        <Link
          href="/invoices"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          Lihat semua →
        </Link>
      </div>

      <div className="divide-y divide-border">
        {outstanding.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Semua invoice sudah lunas
            </p>
          </div>
        ) : (
          outstanding.slice(0, 5).map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    {inv.customerName}
                  </p>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {inv.invoiceNumber ?? "Draft"} ·{" "}
                  {inv.dueDate
                    ? `Jatuh tempo ${formatDateShort(inv.dueDate)}`
                    : "Belum ada jatuh tempo"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrency(inv.remainingBalance)}
                </p>
                {inv.status === "PARTIALLY_PAID" && (
                  <p className="text-xs text-muted-foreground">
                    Dibayar {formatCurrency(inv.totalPaid)}
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
