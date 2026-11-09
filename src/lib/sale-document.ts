import type { DocumentParty } from "./purchase-document";
import { cents, fromCents, multiplyMoney, sumMoney } from "./money";

export const saleDocumentFormats = [
  { value: "invoice", label: "Invoice" },
  { value: "delivery", label: "Surat Jalan (SJ)" },
  { value: "thermal", label: "Struk Thermal 58 mm" },
] as const;
export type SaleDocumentFormat = typeof saleDocumentFormats[number]["value"];
export type SaleDocumentData = {
  id: string; number: number; date: string; business: DocumentParty; customer: DocumentParty;
  items: (import("./measurement").Measurement & { id:string; name:string; variant:string|null; quantity:string; unit:string; price:string; weight:string|null; pieces:string|null })[];
  total:string; discount:string; paid:string; credited:string; balance:string;
  dueDate:string|null; note:string|null; cancelled:boolean;
};
export function saleDocumentNumber(number: number, format: SaleDocumentFormat) {
  return `${format === "delivery" ? "SJ" : format === "thermal" ? "STR" : "INV"}-${String(number).padStart(6, "0")}`;
}
export function saleDocumentTotals(data: Pick<SaleDocumentData,"items"|"discount"|"total"|"credited">) {
  const subtotals = data.items.map(item => multiplyMoney(item.price, item.quantity));
  const subtotal = sumMoney(subtotals);
  if (cents(subtotal) - cents(data.discount) !== cents(data.total)) throw new Error("Rincian penjualan tidak sesuai total transaksi.");
  return { subtotals, subtotal, net: fromCents(cents(data.total) - cents(data.credited)) };
}
export function saleDocumentStatus(data: Pick<SaleDocumentData,"cancelled"|"balance"|"paid"|"credited"|"total">) {
  if (data.cancelled) return "Dibatalkan";
  if (cents(data.balance) <= BigInt(0)) return cents(data.credited) >= cents(data.total) && cents(data.total) > BigInt(0) ? "Selesai melalui retur" : "Lunas";
  return cents(data.paid) > BigInt(0) ? "Dibayar sebagian" : "Belum dibayar";
}
