"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function login(formData: FormData) {
  const identifier = String(formData.get("email") ?? "").trim();
  // Alias sementara untuk akun demo; akun lain tetap memakai email masing-masing.
  const email = identifier.toLowerCase() === "owner" ? "owner@example.invalid" : identifier;
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=missing");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/login?error=config");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=login");
  redirect("/");
}
