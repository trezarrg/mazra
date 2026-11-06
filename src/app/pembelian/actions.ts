"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { failureReturnPath } from "@/lib/action-feedback";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => value(form, key) || null;
function finish(form: FormData, error?: string): never {
  revalidatePath("/dokumen", "layout");
  revalidatePath("/pembelian"); revalidatePath("/stok");
  for(const path of ["/","/tagihan","/riwayat","/penerimaan","/akuntansi","/analisis"])revalidatePath(path);
  const url = new URL(error ? failureReturnPath(form, "/pembelian") : "/pembelian", "http://localhost");
  url.searchParams.set(error ? "error" : "ok", error || "1"); url.searchParams.set("r", String(Date.now()));
  redirect(url.pathname + url.search);
}
function message(error: { message: string } | null) {
  if (!error) return undefined;
  const known = ["Tidak memiliki akses", "Data DO tidak valid", "Supplier atau produk dengan satuan kg tidak aktif", "DO sudah digunakan dengan data berbeda", "Data penerimaan tidak valid", "DO tidak ditemukan", "Nominal tagihan borongan tidak valid", "Dasar tagihan tidak valid", "Nilai tagihan terlalu besar", "Penerimaan sudah digunakan dengan data berbeda", "Total tagihan borongan melebihi harga DO", "Ada hasil timbang menunggu konfirmasi. Konfirmasi atau batalkan hasil timbang terlebih dahulu"];
  return known.find(item => error.message.includes(item)) ?? "Data tidak dapat disimpan. Periksa isian dan coba lagi.";
}
export async function createDO(form: FormData) {
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const { error } = await db.rpc("create_purchase_do", { p_id:value(form,"id"), p_date:value(form,"date"), p_supplier:value(form,"supplier"), p_product:value(form,"product"), p_origin:optional(form,"origin"), p_weight:optional(form,"weight"), p_count:optional(form,"count"), p_method:value(form,"method"), p_price:value(form,"price"), p_note:optional(form,"note") });
  finish(form, message(error));
}
export async function confirmReceipt(form: FormData) {
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const { error } = await db.rpc("confirm_purchase_receipt", { p_id:value(form,"id"), p_do:value(form,"do_id"), p_date:value(form,"date"), p_origin_weight:optional(form,"origin_weight"), p_actual_weight:value(form,"actual_weight"), p_billing_quantity:optional(form,"billing_quantity"), p_lump_amount:optional(form,"lump_amount"), p_note:optional(form,"note") });
  finish(form, message(error));
}
