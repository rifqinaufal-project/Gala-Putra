import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

interface SortableHeaderProps {
  label: string;
  href: string;
  active?: boolean;
  direction?: "asc" | "desc";
  className?: string;
}

export function SortableHeader({ label, href, active, direction, className }: SortableHeaderProps) {
  const Icon = active ? (direction === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <Link href={href} className="group inline-flex items-center gap-1.5 rounded-md py-1 text-inherit transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25">
        {label}
        <Icon className={`size-3 ${active ? "text-foreground" : "text-muted-foreground/60 group-hover:text-foreground"}`} aria-hidden="true" />
        <span className="sr-only">Urutkan berdasarkan {label}</span>
      </Link>
    </TableHead>
  );
}
