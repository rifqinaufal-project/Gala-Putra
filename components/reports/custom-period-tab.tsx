"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CustomPeriodTabProps {
  path: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
}

function parseDate(value?: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function toDateParam(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function CustomPeriodTab({ path, active, startDate, endDate }: CustomPeriodTabProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(
    startDate && endDate ? { from: parseDate(startDate), to: parseDate(endDate) } : undefined
  );
  const selectedLabel = range?.from && range.to
    ? `${format(range.from, "d MMM", { locale: id })} - ${format(range.to, "d MMM yyyy", { locale: id })}`
    : "Pilih tanggal";

  const applyRange = () => {
    if (!range?.from || !range.to) return;
    router.push(`${path}?period=custom&startDate=${toDateParam(range.from)}&endDate=${toDateParam(range.to)}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<button type="button" aria-current={active ? "page" : undefined} />}
        className={`rounded-full px-3 py-1.5 text-center text-xs font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 ${active ? "bg-white text-foreground shadow-[0_1px_5px_rgba(0,0,0,0.1)]" : "text-muted-foreground hover:text-foreground"}`}
      >
        Custom
      </PopoverTrigger>
      <PopoverContent align="end" className="w-fit max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Pilih rentang tanggal</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{selectedLabel}</p>
        </div>
        <Calendar
          mode="range"
          selected={range}
          onSelect={(next) => setRange(next)}
          numberOfMonths={2}
          locale={id}
          disabled={{ after: new Date() }}
          defaultMonth={range?.from ?? new Date()}
        />
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
          <Button type="button" size="sm" onClick={applyRange} disabled={!range?.from || !range?.to}>
            <Check className="size-3.5" /> Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
