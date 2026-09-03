import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type AccentColor = "blue" | "emerald" | "amber" | "red" | "violet" | "sky" | "orange" | "stone";

const iconMap: Record<AccentColor, { iconBg: string; iconText: string }> = {
  blue:    { iconBg: "bg-primary/8", iconText: "text-primary" },
  emerald: { iconBg: "bg-primary/8", iconText: "text-primary" },
  amber:   { iconBg: "bg-amber-50", iconText: "text-amber-700" },
  red:     { iconBg: "bg-red-50", iconText: "text-red-700" },
  violet:  { iconBg: "bg-primary/8", iconText: "text-primary" },
  sky:     { iconBg: "bg-primary/8", iconText: "text-primary" },
  orange:  { iconBg: "bg-amber-50", iconText: "text-amber-700" },
  stone:   { iconBg: "bg-muted", iconText: "text-muted-foreground" },
};

interface MetricCardProps {
  title: string;
  value: string | number;
  isCurrency?: boolean;
  change?: number;
  changeLabel?: string;
  icon?: LucideIcon;
  href?: string;
  suffix?: string;
  className?: string;
  internal?: boolean;
  accent?: AccentColor;
}

export function MetricCard({
  title,
  value,
  isCurrency = false,
  change,
  changeLabel,
  icon: Icon,
  href,
  suffix,
  className,
  internal = false,
  accent = "stone",
}: MetricCardProps) {
  const displayValue = isCurrency ? formatCurrency(value as number) : value;
  const changePositive = change !== undefined && change > 0;
  const changeNegative = change !== undefined && change < 0;
  const { iconBg, iconText } = iconMap[accent];

  const content = (
    <div className={cn(
      "group relative min-h-[138px] overflow-hidden rounded-[18px] border border-border/80 bg-card p-4 shadow-card transition-[border-color,box-shadow,transform] duration-200 sm:p-5",
      href && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-dropdown",
      className
    )}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {title}
          </p>
          {internal && (
            <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
              Internal
            </span>
          )}
        </div>
        {Icon && (
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-[11px]", iconBg)}>
            <Icon className={cn("size-4", iconText)} strokeWidth={1.9} />
          </div>
        )}
      </div>

       <div className="min-w-0">
         <span className="block max-w-full overflow-hidden text-ellipsis text-[clamp(1.4rem,2.4vw,2rem)] font-bold leading-tight tracking-[-0.055em] text-foreground tabular-nums whitespace-nowrap">
           {displayValue}
         </span>
        {suffix && (
          <span className="ml-1 text-xs font-medium text-muted-foreground sm:text-sm">
            {suffix}
          </span>
        )}
      </div>

      {change !== undefined && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {changePositive ? (
            <TrendingUp className="w-3 h-3 text-emerald-600" />
          ) : changeNegative ? (
            <TrendingDown className="w-3 h-3 text-red-500" />
          ) : (
            <Minus className="w-3 h-3 text-muted-foreground" />
          )}
          <span className={cn(
            "text-xs font-medium",
            changePositive && "text-emerald-600",
            changeNegative && "text-red-500",
            !changePositive && !changeNegative && "text-muted-foreground"
          )}>
            {change > 0 ? "+" : ""}{formatPercent(change)}
          </span>
          {changeLabel && <span className="text-xs text-muted-foreground">{changeLabel}</span>}
        </div>
      )}
      {href && <ArrowUpRight className="absolute bottom-4 right-4 size-3.5 text-muted-foreground/40 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />}
    </div>
  );

  if (href) return <Link href={href} className="block rounded-[18px] focus-visible:outline-none">{content}</Link>;
  return content;
}
