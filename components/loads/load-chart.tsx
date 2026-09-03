"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { formatWeightKg } from "@/lib/domain/weights";
import type { Load } from "@/types";

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-dropdown">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{formatWeightKg(payload[0].value)}</p>
    </div>
  );
}

export function LoadChart({ loads }: { loads: Load[] }) {
  const byDestination = useMemo(() => {
    const map = new Map<string, { name: string; totalKg: number; totalCost: number; count: number }>();
    for (const load of loads) {
      const existing = map.get(load.destinationName) ?? { name: load.destinationName, totalKg: 0, totalCost: 0, count: 0 };
      existing.totalKg += load.totalQuantityKg;
      existing.totalCost += load.totalPurchaseCost;
      existing.count += 1;
      map.set(load.destinationName, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [loads]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { month: string; totalKg: number }>();
    for (const load of loads) {
      const key = load.loadDate.slice(0, 7);
      const existing = map.get(key) ?? { month: key, totalKg: 0 };
      existing.totalKg += load.totalQuantityKg;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [loads]);

  if (loads.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="erp-surface p-5">
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Total muatan per pabrik</p>
        <p className="mb-4 text-lg font-bold text-foreground">{byDestination.length} pabrik</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDestination} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716c" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#78716c" }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f5f5f4" }} />
              <Bar dataKey="totalKg" fill="#1c1917" radius={[0, 6, 6, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="erp-surface p-5">
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Tren muatan bulanan</p>
        <p className="mb-4 text-lg font-bold text-foreground">{byMonth.length} bulan</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#78716c" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="totalKg" stroke="#1c1917" strokeWidth={2} dot={{ r: 3, fill: "#1c1917" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}