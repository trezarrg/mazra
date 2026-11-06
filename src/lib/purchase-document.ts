import { cents, fromCents } from "./money";

export type DocumentParty = { name: string; address: string | null; phone: string | null; logo?:string };
export type DocumentPayment = { id: string; date: string; account: string; amount: string; note: string | null; kind: "payment" | "refund" };
export type PurchaseDocumentData = {
  id: string; number: string; doNumber: number; orderDate: string; receiptDate: string;
  business: DocumentParty; supplier: DocumentParty; product: string; origin: string | null;
  originWeight: string | null; actualWeight: string; billingQuantity: string | null;
  priceMethod: string; unitPrice: string; total: string; credited: string; paid: string; balance: string;
  dueDate: string | null; note: string | null; payments: DocumentPayment[]; cancelled?:boolean;
};

export function purchaseDocumentNumber(doNumber: number, receiptId: string) {
  return `PB-${String(doNumber).padStart(6, "0")}-${receiptId.slice(0, 8).toUpperCase()}`;
}

export function purchaseDocumentStatus(data: Pick<PurchaseDocumentData, "total" | "credited" | "balance" | "paid" | "cancelled">) {
  if(data.cancelled)return "Dibatalkan";
  if (cents(data.balance) <= BigInt(0)) return cents(data.credited) >= cents(data.total) && cents(data.total) > BigInt(0) ? "Selesai melalui retur" : "Lunas";
  return cents(data.paid) > BigInt(0) ? "Dibayar sebagian" : "Belum dibayar";
}

export function netPurchaseTotal(data: Pick<PurchaseDocumentData, "total" | "credited">) {
  return fromCents(cents(data.total) - cents(data.credited));
}
