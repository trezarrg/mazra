import { readFile } from "node:fs/promises";

export function validateClients(value) {
  if (!Array.isArray(value?.clients) || !value.clients.length) throw new Error("Daftar instalasi kosong.");
  const ids = new Set(), workers = new Set(), refs = new Set(), environments = new Set(), pages = new Set();
  for (const client of value.clients) {
    if (client.pagesProject) {
      if (!/^[a-z][a-z0-9-]{1,62}$/.test(client.pagesProject) || pages.has(client.pagesProject)) throw new Error("Nama Pages harus valid dan terpisah untuk setiap instalasi.");
      pages.add(client.pagesProject);
    }
    if (!/^[a-z][a-z0-9-]{1,50}$/.test(client.id) || !/^[a-z][a-z0-9-]{1,62}$/.test(client.worker)
      || !/^[a-z]{20}$/.test(client.projectRef) || !/^[a-z][a-z0-9-]{1,50}$/.test(client.environment)
      || !["demo", "production"].includes(client.channel) || typeof client.enabled !== "boolean"
      || typeof client.businessName !== "string" || !client.businessName.trim()
      || typeof client.logo !== "string" || !/^\/(?!\/)[a-zA-Z0-9/_.-]+$/.test(client.logo)
      || client.logo.split("/").includes("..")) throw new Error(`Konfigurasi instalasi tidak valid: ${client.id ?? "tanpa id"}`);
    if (client.url && (new URL(client.url).protocol !== "https:" || new URL(client.url).pathname !== "/")) throw new Error("Alamat aplikasi harus origin HTTPS.");
    for (const [set, field] of [[ids,"id"],[workers,"worker"],[refs,"projectRef"],[environments,"environment"]]) {
      if (set.has(client[field])) throw new Error(`Instalasi harus memiliki ${field} terpisah.`);
      set.add(client[field]);
    }
    if (client.channel === "production" && (client.projectRef === "vcephhquqtppxuvypeft" || client.worker === "mazra")) throw new Error("Instalasi klien tidak boleh memakai tujuan demo.");
  }
  return value.clients;
}

export async function loadClients() {
  return validateClients(JSON.parse(await readFile(new URL("../deployments/clients.json", import.meta.url), "utf8")));
}

export function verifyTarget(client, env) {
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${client.projectRef}.supabase.co`) throw new Error("URL Supabase berbeda dari target instalasi.");
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (key.startsWith("sb_publishable_")) return;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (payload.role === "anon" && payload.ref === client.projectRef) return;
  } catch { /* Kunci bukan JWT anon yang sesuai target. */ }
  throw new Error("Gunakan publishable key atau anon key proyek tujuan; secret/service-role ditolak.");
}
