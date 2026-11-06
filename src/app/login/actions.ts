"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export type LoginState = { error: "missing" | "config" | "invalid" | "unavailable" | null };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("email") ?? "").trim();
  // Alias khusus demo; instalasi klien menggunakan email akun masing-masing.
  const demoEmail = process.env.DEMO_LOGIN_EMAIL ?? (process.env.NEXT_PUBLIC_SUPABASE_URL === "https://vcephhquqtppxuvypeft.supabase.co" ? "owner@example.invalid" : "");
  const email = identifier.toLowerCase() === "owner" && demoEmail ? demoEmail : identifier;
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "missing" };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return { error: "config" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.status === 400 ? "invalid" : "unavailable" };
  redirect("/");
}
