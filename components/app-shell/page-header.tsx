import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col justify-between gap-4 border-b border-border/70 pb-5 pt-1 sm:flex-row sm:items-end sm:pb-6", className)}>
      <div className="min-w-0">
        <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary/50">Workspace</p>
        <h2 className="text-[1.65rem] font-bold leading-[1.08] tracking-[-0.045em] text-foreground text-balance sm:text-[1.95rem]">
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">
          {children}
        </div>
      )}
    </header>
  );
}
