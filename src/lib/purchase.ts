import { formatDate } from "./format";
import type { Obligation } from "./operations";
import { nextBusinessDate } from "./reminders";

export const purchasePaymentLabels: Record<string, string> = {
  pending_receipt: "Belum diterima", unpaid: "Belum lunas", partial: "Belum lunas · Sebagian dibayar",
  paid: "Lunas", cancelled: "Dibatalkan", unavailable: "Status belum dapat dimuat",
};

export function purchaseDueReminder(bill: Pick<Obligation, "balance" | "due_date">, today: string) {
  if (Number(bill.balance) <= 0 || !bill.due_date || bill.due_date > nextBusinessDate(today)) return null;
  if (bill.due_date < today) return `Lewat jatuh tempo ${formatDate(bill.due_date)}`;
  if (bill.due_date === today) return "Jatuh tempo hari ini";
  return `Jatuh tempo besok (${formatDate(bill.due_date)})`;
}

export function documentStatus(document: { payment_state?: string | null; reversed_by?: string | null; status: string }, labels: Record<string, string>) {
  if (document.reversed_by) return "Dikoreksi";
  return document.payment_state ? purchasePaymentLabels[document.payment_state] ?? document.payment_state : labels[document.status] ?? document.status;
}
