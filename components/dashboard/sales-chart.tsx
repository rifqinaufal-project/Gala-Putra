"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrencyCompact } from "@/lib/utils";
import type { SalesDataPoint } from "@/types";

interface SalesChartProps {
  data: SalesDataPoint[];
  periodLabel?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-dropdown px-4 py-3 text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="font-semibold text-foreground">
        {formatCurrencyCompact(payload[0].value)}
      </p>
      <p className="text-xs text-muted-foreground">
        {payload[1]?.value} order
      </p>
    </div>
  );
}

export function SalesChart({ data, periodLabel }: SalesChartProps) {
  return (
    <div className="erp-surface p-5">
      <div className="mb-4">
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">
          Penjualan Harian
        </p>
        <p className="text-lg font-bold text-foreground">{periodLabel ?? "Periode berjalan"}</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f1f4f2" }} />
            <Bar dataKey="revenue" fill="#20201f" radius={[5, 5, 0, 0]} maxBarSize={32} />
            <Bar dataKey="orders" fill="#b9b9b4" radius={[5, 5, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
