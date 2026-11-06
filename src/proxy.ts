import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/supabase/session-options";
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookieOptions:sessionCookieOptions, cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (entries, headers) => {
      entries.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(headers).forEach(([name,value])=>response.headers.set(name,value));
    },
  }});
  try { await supabase.auth.getUser(); } catch { /* requireAccess memverifikasi akses; jangan memutus sesi saat jaringan bermasalah. */ }
  response.headers.set("Cache-Control","private, no-store, max-age=0");
  return response;
}
export const config = { matcher: ["/((?!_next/|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"] };
