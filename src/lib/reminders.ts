import type { Obligation } from "./operations";

export type ReminderGroup = { count: number; total: string; items: Obligation[] };
export type ReminderSide = Record<"overdue" | "today" | "tomorrow" | "unscheduled", ReminderGroup>;
export type Reminders = { today: string; receivable: ReminderSide; payable: ReminderSide };
export const reminderLabels = { overdue: "Terlambat", today: "Hari ini", tomorrow: "Besok", unscheduled: "Belum dijadwalkan" };
export function reminderPath(kind: string, status: string) {
  return `/tagihan?tab=${kind === "payable" ? "hutang" : "piutang"}&period=all&status=${status}`;
}
export function nextBusinessDate(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
