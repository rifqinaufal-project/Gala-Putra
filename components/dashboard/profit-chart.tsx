"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrencyCompact, formatPercent } from "@/lib/utils";
import type { ProfitDataPoint } from "@/types";

interface ProfitChartProps {
  data: ProfitDataPoint[];
  periodLabel?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-dropdown px-4 py-3 text-sm">
      <p className="text-muted-foreground text-xs mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-neutral-900" />
          <span className="text-xs text-muted-foreground">Laba bersih</span>
          <span className="text-xs font-semibold ml-auto">
            {formatCurrencyCompact(payload[0]?.value ?? 0)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-muted-foreground">Margin</span>
          <span className="text-xs font-semibold ml-auto">
            {formatPercent(payload[1]?.value ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProfitChart({ data, periodLabel }: ProfitChartProps) {
  return (
    <div className="erp-surface p-5">
      <div className="mb-4">
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">
          Laba Bersih & Margin
        </p>
        <p className="text-lg font-bold text-foreground">{periodLabel ?? "Periode berjalan"}</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ddddda" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#999" }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tickFormatter={(v) => formatCurrencyCompact(v)}
              tick={{ fontSize: 11, fill: "#999" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="#20201f"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#171716" }}
            />
            <Line
              type="monotone"
              dataKey="margin"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, fill: "#a3a3a3" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
