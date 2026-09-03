export type SortDirection = "asc" | "desc";

export function normalizeSortDirection(value?: string): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

export function getSortHref(path: string, period: string, sort: string, activeSort?: string, direction?: SortDirection) {
  const params = new URLSearchParams({ period, sort });
  params.set("direction", activeSort === sort && direction === "asc" ? "desc" : "asc");
  return `${path}?${params.toString()}`;
}

export function compareValues(a: string | number | undefined, b: string | number | undefined, direction: SortDirection) {
  const left = a ?? "";
  const right = b ?? "";
  const result = typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), "id-ID", { numeric: true, sensitivity: "base" });
  return direction === "desc" ? result * -1 : result;
}
