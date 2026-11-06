export const officeRoles = ["developer", "owner", "admin"];
export type Option = { value: string; label: string };
export type Product = { id: string; name: string; product_units: { unit: string }[]; product_variants: { id: string; name: string; active: boolean }[] };
export type ItemData = { product: string; variant: string; unit: string; quantity: string; price: string; weight: string; direction: string; source_item?: string; count?: string };
export type OperationData = Record<string, string | ItemData[]>;
export type Operation = {
  id: string; document_no: number; kind: string; operation_date: string; status: string; amount: string; discount: string; refund_amount: string; category?:string|null;
  note: string | null; payload: OperationData; created_by: string; created_at: string;
  source_id: string | null; account_id: string | null; target_account_id: string | null; partner_id: string | null; due_date: string | null; reversed_by: string | null; driver_id?:string|null;
};
export type Item = { id: string; product_id: string; variant_id: string | null; unit: string; quantity: string; price: string; actual_weight: string | null; piece_count?: string | null; direction: string; products: { name: string } | null; product_variants: { name: string } | null };
export type Obligation = { kind: string; source_id: string; partner_id: string; partner_name: string; reference: string; document_date: string; due_date: string | null; total: string; paid: string; credited: string; balance: string };
export const kindLabels: Record<string, string> = { sale: "Penjualan", production: "Hasil potong", adjustment: "Penyesuaian stok", sale_return: "Retur penjualan", purchase_return: "Retur pembelian", finance: "Catatan keuangan", transfer: "Transfer", payroll: "Pembayaran gaji", advance: "Kasbon", advance_repayment: "Pengembalian kasbon", purchase_receipt: "Penerimaan pembelian", opening: "Saldo awal", opening_correction: "Koreksi saldo awal", payment: "Pembayaran", reversal: "Pembalikan dokumen" };
export const statusLabels: Record<string, string> = { draft: "Draft", final: "Selesai", pending: "Menunggu verifikasi", verified: "Terverifikasi", cancelled: "Dibatalkan", open: "Terbuka", closed: "Ditutup" };
export function paymentStatus(b: Pick<Obligation, "balance" | "paid" | "due_date">, today: string) {
  if (Number(b.balance) <= 0) return "Lunas";
  if (b.due_date && b.due_date < today) return "Lewat tempo";
  return Number(b.paid) > 0 ? "Sebagian" : "Belum bayar";
}
