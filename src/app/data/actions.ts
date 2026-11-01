"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access";

const text = (data: FormData, key: string, max = 200) => String(data.get(key) ?? "").trim().slice(0, max);
const optional = (data: FormData, key: string, max = 200) => text(data, key, max) || null;
function complete(error: string | undefined, tab: string) {
  revalidatePath("/data");
  redirect(`/data?tab=${tab}&r=${Date.now()}&${error ? `error=${encodeURIComponent(error)}` : "ok=1"}`);
}


export async function savePartner(data: FormData) {
  const finish = (error?: string) => complete(error, "mitra");
  const fail = (error: { message: string } | null) => { if(error) finish("Data tidak dapat disimpan. Periksa isian dan coba lagi."); };
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const id = text(data, "id"), name = text(data, "name");
  const is_supplier = data.has("supplier"), is_customer = data.has("customer");
  if (!name || (!is_supplier && !is_customer)) finish("Isi nama dan pilih peran mitra.");
  const value = { name, is_supplier, is_customer, phone: optional(data, "phone", 50), address: optional(data, "address", 1000), notes: optional(data, "notes", 1000), active: data.has("active"), updated_at: new Date().toISOString() };
  const { error } = id ? await db.from("partners").update(value).eq("id", id) : await db.from("partners").insert(value);
  fail(error); finish();
}
export async function saveProduct(data: FormData) {
  const finish = (error?: string) => complete(error, "produk");
  const fail = (error: { message: string } | null) => { if(error) finish("Data tidak dapat disimpan. Periksa isian dan coba lagi."); };
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const id = text(data, "id"), name = text(data, "name");
  const units = data.getAll("units").map(unit => String(unit));
  if (!name || !units.length) finish("Isi nama produk dan pilih sedikitnya satu satuan.");
  const { error } = await db.rpc("save_product", { p_id: id || null, p_name: name, p_units: units, p_active: data.has("active") });
  if (error?.message.includes("Satuan yang sudah memiliki gerakan stok")) finish("Satuan yang sudah memiliki gerakan stok tidak dapat dilepas.");
  fail(error); finish();
}
export async function saveUnit(data: FormData) {
  const finish = (error?: string) => complete(error, "satuan");
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const existing = data.has("existing"), code = text(data, "code", 20).toLowerCase(), name = text(data, "name", 60);
  if (!/^[a-z][a-z0-9_]{0,19}$/.test(code) || !name) finish("Isi kode dan nama satuan dengan benar.");
  const result = existing ? await db.from("unit_catalog").update({name, active:data.has("active")}).eq("code", code) : await db.from("unit_catalog").insert({code, name, whole_only:data.has("whole_only"), active:true});
  if (result.error) finish(result.error.code === "23505" ? "Kode satuan sudah digunakan." : "Satuan tidak dapat disimpan.");
  finish();
}
export async function saveVariant(data: FormData) {
  const finish = (error?: string) => complete(error, "produk");
  const fail = (error: { message: string } | null) => { if(error) finish("Data tidak dapat disimpan. Periksa isian dan coba lagi."); };
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const product_id = text(data, "product_id"), name = text(data, "name"), id = text(data, "id");
  if (!product_id || !name) finish("Isi nama varian.");
  const value = { product_id, name, active: data.has("active") };
  const { error } = id ? await db.from("product_variants").update(value).eq("id", id).eq("product_id", product_id) : await db.from("product_variants").insert(value);
  fail(error); finish();
}
export async function saveAccount(data: FormData) {
  const finish = (error?: string) => complete(error, "akun");
  const fail = (error: { message: string } | null) => { if(error) finish("Data tidak dapat disimpan. Periksa isian dan coba lagi."); };
  const { db } = await requireAccess(["developer", "owner", "admin"]);
  const id = text(data, "id"), name = text(data, "name"), account_type = text(data, "account_type"), holder_id = optional(data, "holder_id");
  if (!name || !["cash", "bank", "collector"].includes(account_type) || (account_type === "collector") !== !!holder_id) finish("Isi nama dan jenis akun dengan benar; kas penagih memerlukan pemegang.");
  const value = { name, account_type, holder_id, active: data.has("active") };
  const { error } = id ? await db.from("cash_accounts").update(value).eq("id", id) : await db.from("cash_accounts").insert(value);
  fail(error); finish();
}
export async function saveSettings(data: FormData) {
  const finish = (error?: string) => complete(error, "usaha");
  const fail = (error: { message: string } | null) => { if(error) finish("Data tidak dapat disimpan. Periksa isian dan coba lagi."); };
  const { db } = await requireAccess(["developer", "owner"]);
  const name = text(data, "name");
  if (!name) finish("Isi nama usaha.");
  const { error } = await db.from("business_settings").update({ name, phone: optional(data, "phone", 50), address: optional(data, "address", 1000), updated_at: new Date().toISOString() }).eq("id", true);
  fail(error); finish();
}
export async function addProfile(data: FormData) {
  const finish = (error?: string) => complete(error, "pengguna");
  const { db } = await requireAccess(["developer", "owner"]);
  const email = text(data, "email", 254), name = text(data, "name"), roles = data.getAll("roles").map(String);
  if (!email || !name || !roles.length || roles.some(role => !["owner", "admin", "production", "driver", "collector"].includes(role))) finish("Isi email, nama, dan sedikitnya satu peran pengguna.");
  const { error } = await db.rpc("add_team_access", { p_email: email, p_name: name, p_roles: roles });
  if (error) finish(error.message.includes("Akun Auth") ? "Akun Auth terkonfirmasi tidak ditemukan." : error.message.includes("sudah ada") ? "Profil pengguna sudah ada." : "Profil tidak dapat dibuat.");
  finish();
}
export async function saveProfile(data: FormData) {
  const finish = (error?: string) => complete(error, "pengguna");
  const { db } = await requireAccess(["developer", "owner"]);
  const id = text(data, "id"), name = text(data, "name"), roles = data.getAll("roles").map(String);
  if (!id || !name || !roles.length || roles.some(role => !["owner", "admin", "production", "driver", "collector"].includes(role))) finish("Isi nama dan sedikitnya satu peran pengguna.");
  const { error } = await db.rpc("save_team_access", { p_id: id, p_name: name, p_roles: roles, p_active: data.has("active") });
  if (error) finish(error.message.includes("Akses pengelola sendiri") ? "Akses pengelola sendiri tidak dapat dihapus atau dinonaktifkan." : "Profil tidak dapat disimpan.");
  finish();
}
