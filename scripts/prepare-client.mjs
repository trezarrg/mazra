import { appendFile, access } from "node:fs/promises";
import { loadClients, verifyTarget } from "./client-config.mjs";

const [command, id] = process.argv.slice(2);
const clients = await loadClients();
if (command === "matrix") {
  if (!["demo", "production"].includes(id)) throw new Error("Pilih demo atau production.");
  const targets = clients.filter(c => c.enabled && c.channel === id);
  if (!targets.length) throw new Error("Belum ada instalasi aktif pada kelompok ini.");
  console.log(JSON.stringify({ include: targets.map(({id,environment}) => ({id,environment})) }));
} else if (command === "environment") {
  const client = clients.find(c => c.id === id && c.enabled);
  if (!client) throw new Error("Instalasi tidak ditemukan atau belum aktif.");
  verifyTarget(client, process.env);
  for (const key of ["SUPABASE_ACCESS_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]) {
    if (!process.env[key]?.trim()) throw new Error(`Konfigurasi rilis belum diisi: ${key}`);
  }
  await access(new URL(`../public${client.logo}`, import.meta.url));
  if (!process.env.GITHUB_ENV) throw new Error("Perintah environment hanya dipakai di GitHub Actions.");
  const values = {
    APP_WORKER_NAME:client.worker,
    NEXT_PUBLIC_BUSINESS_NAME:client.businessName,
    NEXT_PUBLIC_BUSINESS_LOGO:client.logo,
    CLIENT_PROJECT_REF:client.projectRef,
    DEMO_LOGIN_EMAIL:client.channel === "demo" ? "owner@example.invalid" : "",
  };
  if (Object.values(values).some(v => /[\r\n]/.test(v))) throw new Error("Konfigurasi tidak boleh mengandung baris baru.");
  await appendFile(process.env.GITHUB_ENV, Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join(""));
  console.log(`Target tervalidasi: ${client.id} / ${client.worker} / ${client.projectRef}`);
} else throw new Error("Gunakan matrix <kelompok> atau environment <id>.");
