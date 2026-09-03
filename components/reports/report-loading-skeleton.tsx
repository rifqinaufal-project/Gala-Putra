import { Skeleton } from "@/components/ui/skeleton";

interface ReportLoadingSkeletonProps {
  cards: number;
  chart?: "single" | "split";
  breakdown?: boolean;
}

export function ReportLoadingSkeleton({ cards, chart, breakdown = false }: ReportLoadingSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat laporan">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:pb-6">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-20 rounded-md" />
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 max-w-full rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 ${cards >= 6 ? "lg:grid-cols-3" : "lg:grid-cols-3"} lg:gap-4`}>
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="min-h-[154px] rounded-[18px] border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <Skeleton className="h-3 w-28 rounded-md" />
              <Skeleton className="size-9 rounded-[11px]" />
            </div>
            <Skeleton className="h-7 w-36 rounded-md" />
            <Skeleton className="mt-3 h-3 w-24 rounded-md" />
          </div>
        ))}
      </div>

      {chart && (
        <div className={`grid grid-cols-1 gap-4 ${chart === "split" ? "lg:grid-cols-2" : ""}`}>
          <div className="erp-surface p-5">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="mt-2 h-6 w-36 rounded-md" />
            <Skeleton className="mt-6 h-48 w-full rounded-xl" />
          </div>
          {chart === "split" && <div className="erp-surface p-5">
            <Skeleton className="h-3 w-32 rounded-md" />
            <Skeleton className="mt-2 h-6 w-40 rounded-md" />
            <Skeleton className="mt-6 h-48 w-full rounded-xl" />
          </div>}
        </div>
      )}

      {breakdown && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="erp-surface p-5">
            <Skeleton className="h-4 w-36 rounded-md" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="erp-surface overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <Skeleton className="h-4 w-44 rounded-md" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
                  <Skeleton className="h-3 w-32 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!breakdown && (
        <div className="erp-surface overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-4 w-44 rounded-md" />
          </div>
          <div className="hidden space-y-0 lg:block">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-5 border-b border-border px-5 py-4 last:border-0">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3 flex-1 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            ))}
          </div>
          <div className="divide-y divide-border lg:hidden">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
