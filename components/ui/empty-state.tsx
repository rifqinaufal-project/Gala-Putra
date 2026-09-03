import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = PackageX,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center sm:py-16",
        className
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border bg-accent shadow-[inset_0_1px_0_white]">
        <Icon className="size-5 text-primary/70" />
      </div>
      <h3 className="mb-1 text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
      {description && (
        <p className="mb-5 max-w-sm text-sm leading-6 text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      {actionLabel && (
        <>
          {actionHref ? (
            <Button size="sm">
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
