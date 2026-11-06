// Kunci API hanya diterima lewat stdin dari CLI, tidak dicetak atau disimpan.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadClients } from "./client-config.mjs";

try {
  const [clientId,email] = process.argv.slice(2);
  const client = (await loadClients()).find(c=>c.id===clientId && c.enabled);
  if (!client || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email??"")) throw new Error("Isi instalasi dan email yang valid.");
  let input="";
  for await (const chunk of process.stdin) input+=chunk;
  const keys=JSON.parse(input.replace(/^\uFEFF/,""));
  const adminKey=keys.find(k=>k.name==="service_role")?.api_key;
  const publicKey=keys.find(k=>k.name==="anon")?.api_key;
  if (!adminKey || !publicKey) throw new Error("Kunci API yang diperlukan belum tersedia.");
  const directory=`artifacts/client-access/${client.id}`;
  const credentials=`${directory}/developer-login.txt`;
  try { await readFile(credentials); throw new Error("Berkas login sudah ada; password tidak direset."); }
  catch(error) { if(error.code!=="ENOENT") throw error; }
  const password=`${randomBytes(24).toString("base64url")}aA1!`;
  await mkdir(directory,{recursive:true});
  // Simpan sebelum membuat akun agar password tidak hilang bila proses terputus.
  await writeFile(credentials,`Instalasi: ${client.businessName}\nSupabase: ${client.projectRef}\nEmail developer: ${email}\nPassword awal: ${password}\n\nSimpan di password manager pribadi. Jangan commit atau bagikan ke owner klien.\nPembuatan akun harus diverifikasi sebelum dipakai.\n`,{flag:"wx",mode:0o600});
  const url=`https://${client.projectRef}.supabase.co`;
  const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(error || !data.user) throw new Error("Pembuatan Auth gagal; periksa akun melalui Supabase. Password tidak diubah pada akun yang sudah ada.");
  await writeFile(`.env.${client.id}.local`,`NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}\nNEXT_PUBLIC_BUSINESS_NAME=${client.businessName}\nNEXT_PUBLIC_BUSINESS_LOGO=${client.logo}\nAPP_WORKER_NAME=${client.worker}\nDEMO_LOGIN_EMAIL=\n`,{flag:"wx",mode:0o600});
  console.log(`Akun Auth developer dibuat. Profil developer masih harus dipasang melalui bootstrap-developer.sql. Kredensial hanya disimpan di ${credentials}.`);
} catch {
  console.error("Penyiapan belum selesai. Periksa akun Auth dan berkas lokal client-access; tidak ada password akun lama yang diubah. Kunci API tidak ditampilkan.");
  process.exitCode=1;
}
