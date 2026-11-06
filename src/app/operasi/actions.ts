"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";
import { failureReturnPath } from "@/lib/action-feedback";
import { businessToday } from "@/lib/period";

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => value(form,name) || null;
function returnPath(form: FormData) {
  const path = value(form,"return_to");
  return /^\/(penjualan|produksi|penerimaan|stok|keuangan|tagihan|akuntansi|sdm|aset|pembelian|dokumen\/(?:pembelian\/)?[0-9a-f-]{36})?(\?[^#]*)?$/.test(path) ? path : "/";
}
function finish(form: FormData, error?: { message: string; code?: string } | null): never {
  revalidatePath("/dokumen", "layout");
  for (const path of ["/", "/penjualan", "/pembelian", "/produksi", "/stok", "/keuangan", "/tagihan", "/riwayat", "/akuntansi", "/analisis", "/sdm", "/aset", "/dokumen/[id]"]) revalidatePath(path, path.includes("[") ? "page" : undefined);
  const path = error ? failureReturnPath(form, returnPath(form)) : returnPath(form);
  const url = new URL(path,"http://localhost"); url.searchParams.delete("error"); url.searchParams.delete("ok");
  // Hanya pesan validasi eksplisit dari fungsi aplikasi boleh tampil; detail SQL disembunyikan.
  const message = error?.code === "P0001" ? error.message : "Data tidak dapat disimpan. Periksa isian dan coba lagi.";
  url.searchParams.set(error ? "error" : "ok", error ? message : "1"); url.searchParams.set("r",String(Date.now()));
  redirect(url.pathname + url.search);
}
export async function saveOperation(form: FormData) {
  const kind=value(form,"kind"); const { db }=await requireAccess([...officeRoles,...(kind==="production"?["production"]:[])]);
  let data: unknown; try { data=JSON.parse(value(form,"data")); } catch { finish(form,{message:"Data transaksi tidak valid",code:"P0001"}); }
  if(value(form,"correction_source")) {
    const {data:destination,error}=await db.rpc("change_transaction",{p_id:value(form,"id"),p_kind:"operation",p_source:value(form,"correction_source"),p_action:"replace",p_date:businessToday(),p_reason:value(form,"correction_reason"),p_data:data});
    if(!error)form.set("return_to",`/dokumen/${destination}`);finish(form,error);
  }
  const {error}=await db.rpc("save_operation",{p_id:value(form,"id"),p_kind:kind,p_data:data,p_final:value(form,"intent")==="final"});
  if (!error && kind === "sale" && value(form,"intent") === "final") form.set("return_to",`/dokumen/${value(form,"id")}`);
  finish(form,error);
}
export async function payBill(form: FormData) {
  const {db}=await requireAccess(officeRoles);
  const {error}=await db.rpc("post_payment",{p_id:value(form,"id"),p_kind:value(form,"kind"),p_source:value(form,"source"),p_date:value(form,"date"),p_account:value(form,"account"),p_amount:value(form,"amount"),p_note:optional(form,"note")});finish(form,error);
}
export async function setBillDue(form: FormData) {
  const {db}=await requireAccess(officeRoles);
  const {error}=await db.rpc("set_bill_due",{p_kind:value(form,"kind"),p_source:value(form,"source"),p_date:optional(form,"due")});finish(form,error);
}
export async function saveStockCost(form: FormData) {
  const {db}=await requireAccess(["developer","owner"]);
  const {error}=await db.rpc("save_stock_cost",{p_movement:value(form,"movement"),p_value:value(form,"amount"),p_reason:value(form,"reason")});finish(form,error);
}
export async function cancelDraft(form: FormData) {
  const {db}=await requireAccess([...officeRoles,"production"]);const {error}=await db.rpc("cancel_draft",{p_id:value(form,"id")});finish(form,error);
}
export async function reverseDocument(form: FormData) {
  const {db}=await requireAccess(officeRoles);const {error}=await db.rpc("reverse_document",{p_id:value(form,"id"),p_kind:value(form,"kind"),p_source:value(form,"source"),p_date:value(form,"date"),p_note:value(form,"note")});finish(form,error);
}
export async function changeTransaction(form: FormData) {
  const {db}=await requireAccess(officeRoles);let data:unknown;
  try { data=form.has("data")?JSON.parse(value(form,"data")):{note:value(form,"note"),due:optional(form,"due"),driver:optional(form,"driver")}; } catch {finish(form,{message:"Data perbaikan tidak valid",code:"P0001"});}
  const kind=value(form,"source_kind");
  const {data:destination,error}=await db.rpc("change_transaction",{p_id:value(form,"id"),p_kind:kind,p_source:value(form,"source"),p_action:value(form,"action"),p_date:businessToday(),p_reason:value(form,"reason"),p_data:data});
  if(!error&&value(form,"action")==="replace")form.set("return_to",kind==="receipt"?`/dokumen/pembelian/${destination}`:kind==="operation"?`/dokumen/${destination}`:returnPath(form));finish(form,error);
}
export async function cancelDelivery(form: FormData) {
  const {db}=await requireAccess(officeRoles);const {error}=await db.rpc("cancel_delivery",{p_id:value(form,"id"),p_reason:value(form,"reason")});finish(form,error);
}
export async function recordDelivery(form: FormData) {
  const {db}=await requireAccess([...officeRoles,"driver"]);let items:unknown;try{items=JSON.parse(value(form,"items"));}catch{finish(form,{message:"Data pengiriman tidak valid",code:"P0001"});}
  const {error}=await db.rpc("record_delivery",{p_id:value(form,"id"),p_sale:value(form,"source"),p_date:value(form,"date"),p_stage:value(form,"stage"),p_items:items,p_note:optional(form,"note")});finish(form,error);
}
export async function managePurchase(form: FormData) {
  const {db}=await requireAccess(officeRoles); const data:Record<string,string>={};for(const [key,item] of form.entries()) if(typeof item==="string" && key!=="_form_origin")data[key]=item;
  const {error}=await db.rpc("manage_purchase",{p_id:value(form,"id"),p_action:value(form,"action"),p_data:data});finish(form,error);
}
export async function recordMeasurement(form: FormData) {
  const {db}=await requireAccess([...officeRoles,"production"]);const {error}=await db.rpc("record_queue_measurement",{p_id:value(form,"id"),p_do:value(form,"do_id"),p_date:value(form,"date"),p_origin:optional(form,"origin_weight"),p_actual:value(form,"actual_weight"),p_note:optional(form,"note")});finish(form,error);
}
export async function confirmMeasurement(form: FormData) {
  const {db}=await requireAccess(officeRoles);const {error}=await db.rpc("confirm_measurement",{p_id:value(form,"id"),p_measurement:value(form,"measurement_id"),p_billing:optional(form,"billing_quantity"),p_lump:optional(form,"lump_amount"),p_note:optional(form,"note")});finish(form,error);
}
export async function cancelMeasurement(form: FormData) {
  const {db}=await requireAccess([...officeRoles,"production"]);const {error}=await db.rpc("cancel_measurement",{p_id:value(form,"id"),p_note:value(form,"note")});finish(form,error);
}
export async function saveEmployee(form: FormData) {
  const {db}=await requireAccess(officeRoles);const {error}=await db.rpc("save_employee",{p_id:value(form,"id"),p_data:{name:value(form,"name"),job:value(form,"job"),type:value(form,"type"),rate:value(form,"rate"),note:value(form,"note"),active:form.has("active")}});finish(form,error);
}
export async function postHR(form: FormData) {
  const {db}=await requireAccess(officeRoles);const data:Record<string,string>={};for(const [key,item]of form.entries())if(typeof item==="string" && key!=="_form_origin")data[key]=item;
  if(value(form,"correction_source")) {
    const {data:destination,error}=await db.rpc("change_transaction",{p_id:value(form,"id"),p_kind:"operation",p_source:value(form,"correction_source"),p_action:"replace",p_date:businessToday(),p_reason:value(form,"correction_reason"),p_data:data});
    if(!error)form.set("return_to",`/dokumen/${destination}`);finish(form,error);
  }
  const {error}=await db.rpc("post_hr",{p_id:value(form,"id"),p_kind:value(form,"kind"),p_data:data});finish(form,error);
}
export async function saveCategory(form: FormData) {
  const {db}=await requireAccess(["developer","owner"]);const {error}=await db.rpc("save_finance_category",{p_code:value(form,"code"),p_name:value(form,"name"),p_direction:value(form,"direction"),p_classification:value(form,"classification"),p_active:form.has("active")});finish(form,error);
}
export async function uploadEvidence(form: FormData) {
  const {db,user}=await requireAccess(); const source=value(form,"source"); const file=form.get("file");
  if(!(file instanceof File)||file.size===0||file.size>10*1024*1024||!["application/pdf","image/jpeg","image/png"].includes(file.type))finish(form,{code:"P0001",message:"Pilih PDF, JPG atau PNG maksimal 10 MB"});
  const extension=file.type==="application/pdf"?"pdf":file.type==="image/png"?"png":"jpg";
  const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
  const valid=file.type==="application/pdf"?String.fromCharCode(...signature.slice(0,5))==="%PDF-":file.type==="image/png"?[137,80,78,71,13,10,26,10].every((b,i)=>signature[i]===b):signature[0]===255&&signature[1]===216&&signature[2]===255;
  if(!valid)finish(form,{code:"P0001",message:"Isi berkas tidak sesuai format PDF/JPG/PNG"});
  const path=`${source}/${crypto.randomUUID()}.${extension}`;
  const {error:uploadError}=await db.storage.from("transaction-evidence").upload(path,file,{contentType:file.type,upsert:false});if(uploadError)finish(form,uploadError);
  const {error}=await db.from("document_attachments").insert({source_id:source,storage_path:path,file_name:file.name.slice(0,200),created_by:user.id});
  if(error)await db.storage.from("transaction-evidence").remove([path]);finish(form,error);
}
