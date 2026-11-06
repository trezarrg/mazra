import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "./session-options";
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Konfigurasi Supabase belum tersedia.");
  const store = await cookies();
  return createServerClient(url, key, { cookieOptions:sessionCookieOptions, cookies: {
    getAll: () => store.getAll(),
    setAll: (entries) => { try { entries.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Components cannot write cookies. */ } },
  }});
}
