import { cn, getInvoiceStatusLabel } from "@/lib/utils";
import type { InvoiceStatus } from "@/types";

const statusStyles: Record<InvoiceStatus, string> = {
  DRAFT:
    "bg-neutral-100 text-neutral-600 border-neutral-200",
  ISSUED:
    "bg-blue-50 text-blue-700 border-blue-200",
  PARTIALLY_PAID:
    "bg-orange-50 text-orange-700 border-orange-200",
  PAID:
    "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERDUE:
    "bg-red-50 text-red-700 border-red-200",
  VOID:
    "bg-neutral-100 text-neutral-500 border-neutral-200 line-through",
};

const statusDot: Record<InvoiceStatus, string> = {
  DRAFT: "bg-neutral-400",
  ISSUED: "bg-blue-500",
  PARTIALLY_PAID: "bg-orange-500",
  PAID: "bg-emerald-500",
  OVERDUE: "bg-red-500",
  VOID: "bg-neutral-400",
};

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export function InvoiceStatusBadge({
  status,
  className,
}: InvoiceStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
        statusStyles[status],
        className
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", statusDot[status])}
        aria-hidden="true"
      />
      {getInvoiceStatusLabel(status)}
    </span>
  );
}
