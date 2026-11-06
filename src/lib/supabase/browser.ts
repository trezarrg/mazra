"use client";
import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "./session-options";

export function getBrowserClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url || !key) throw new Error("Konfigurasi Supabase belum tersedia.");
  return createBrowserClient(url,key,{cookieOptions:sessionCookieOptions,auth:{autoRefreshToken:true,persistSession:true}});
}
