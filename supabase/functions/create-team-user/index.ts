/* global Deno */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const allowedRoles = ["owner", "admin", "production", "driver"];
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

// JWT diverifikasi langsung ke Auth, termasuk ketika gateway verify_jwt dinonaktifkan.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { error: "Metode tidak tersedia." });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Silakan masuk kembali." });
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !secret) return json(503, { error: "Pembuatan akun belum tersedia." });
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const caller = createClient(url, anon, { ...options, global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authenticationError } = await caller.auth.getUser();
  if (authenticationError || !user) return json(401, { error: "Silakan masuk kembali." });
  const role = await caller.rpc("current_app_role");
  if (role.error || !["developer", "owner"].includes(role.data)) return json(403, { error: "Hanya owner dan developer dapat membuat akun." });

  let input: Record<string, unknown>;
  try {
    if (Number(request.headers.get("Content-Length") ?? 0) > 8192) return json(400, { error: "Isian terlalu panjang." });
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json(400, { error: "Isian tidak valid." });
    input = raw as Record<string, unknown>;
  } catch { return json(400, { error: "Isian tidak valid." }); }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const roles = Array.isArray(input.roles) ? [...new Set(input.roles)] : [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length < 1 || name.length > 200
    || password.length < 10 || password.length > 128 || roles.length < 1 || roles.length > 4
    || roles.some(r => typeof r !== "string" || !allowedRoles.includes(r))) return json(400, { error: "Isi email, nama, password minimal 10 karakter, dan peran yang valid." });

  const admin = createClient(url, secret, options);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    const duplicate = ["email_exists", "user_already_exists"].includes(created.error?.code ?? "");
    return json(400, { error: duplicate ? "Email sudah terdaftar. Gunakan Tambahkan akses akun yang sudah ada." : "Akun tidak dapat dibuat. Periksa email dan kekuatan password." });
  }
  const profile = await caller.rpc("add_team_access", { p_email: email, p_name: name, p_roles: roles });
  if (profile.error) {
    // Hanya akun Auth yang BARU dibuat pada request ini yang dapat dibersihkan.
    const cleanup = await admin.auth.admin.deleteUser(created.data.user.id);
    return json(400, { error: cleanup.error
      ? "Akun login sudah dibuat, tetapi akses belum terpasang. Gunakan Tambahkan akses akun yang sudah ada."
      : "Akses belum dapat dipasang. Akun baru dibatalkan; silakan coba kembali." });
  }
  return json(200, { ok: true });
});
