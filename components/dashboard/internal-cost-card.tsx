import { formatCurrency } from "@/lib/utils";
import type { InternalCostBreakdown } from "@/types";
import Link from "next/link";

interface InternalCostCardProps {
  costs: InternalCostBreakdown[];
  total: number;
}

export function InternalCostCard({ costs, total }: InternalCostCardProps) {
  return (
    <div className="erp-surface p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-xs font-medium text-muted-foreground">
              Biaya Internal
            </p>
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
              Internal
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(total)}
          </p>
        </div>
        <Link
          href="/reports/internal-costs"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Lihat laporan →
        </Link>
      </div>

      <div className="space-y-2.5">
        {costs.map((cost) => {
          const pct = total > 0 ? (cost.amount / total) * 100 : 0;
          return (
            <div key={cost.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {cost.label}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {formatCurrency(cost.amount)}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
