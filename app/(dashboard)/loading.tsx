export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-[#e7e8f4]" />
          <div className="h-4 w-64 animate-pulse rounded-lg bg-[#e7e8f4]" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[#e7e8f4]" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border/80 bg-white/90 p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-[#e7e8f4]" />
              <div className="h-8 w-8 animate-pulse rounded-xl bg-[#e7e8f4]" />
            </div>
            <div className="h-7 w-32 animate-pulse rounded bg-[#e7e8f4]" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-white/90 shadow-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <div className="h-9 flex-1 max-w-sm bg-muted animate-pulse rounded-lg" />
          <div className="h-9 w-20 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 flex-1 bg-muted animate-pulse rounded" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              <div className="h-6 w-14 bg-muted animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
