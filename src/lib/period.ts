export type Query = Record<string, string | undefined>;
export type Period = { mode: string; date: string; month: string; start: string | null; end: string | null; error?: string };
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function resolvePeriod(query: Query, today = businessToday(), monthly = false): Period {
  const mode = query.period ?? (monthly ? "month" : "date");
  const date = isDate(query.date ?? "") ? query.date! : today;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? query.month! : today.slice(0, 7);
  if (mode === "all") return { mode, date, month, start: null, end: null };
  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    return { mode, date, month, start: `${month}-01`, end: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}` };
  }
  if (mode === "range") {
    if (isDate(query.start ?? "") && isDate(query.end ?? "") && query.start! <= query.end!) return { mode, date, month, start: query.start!, end: query.end! };
    return { mode: "date", date, month, start: date, end: date, error: "Rentang tanggal tidak valid." };
  }
  return { mode: "date", date, month, start: date, end: date };
}
export function inPeriod(date: string, period: Period) { return (!period.start || date >= period.start) && (!period.end || date <= period.end); }
