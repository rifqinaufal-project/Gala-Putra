export type ReportPeriod = "1d" | "7d" | "30d" | "all" | "custom";

export function getTodayJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeReportPeriod(value?: string): ReportPeriod {
  return value === "1d" || value === "7d" || value === "30d" || value === "all" || value === "custom" ? value : "30d";
}

function isDateValue(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function getReportPeriodRange(period: ReportPeriod, today = getTodayJakarta(), dates: string[] = [], customStartDate?: string, customEndDate?: string) {
  if (period === "custom" && isDateValue(customStartDate) && isDateValue(customEndDate) && customStartDate <= customEndDate && customEndDate <= today) {
    return { startDate: customStartDate, endDate: customEndDate, label: `${customStartDate} - ${customEndDate}` };
  }

  if (period === "all") {
    const firstDate = [...dates].sort()[0];
    return { startDate: firstDate ?? today, endDate: today, label: "Semua data" };
  }

  const days = period === "1d" ? 1 : period === "7d" ? 7 : 30;
  const start = new Date(`${today}T00:00:00`);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: dateKey(start),
    endDate: today,
    label: period === "1d" ? "Hari ini" : `${days} hari terakhir`,
  };
}

export function isDateInReportPeriod(value: string, startDate: string, endDate: string) {
  return value >= startDate && value <= endDate;
}
