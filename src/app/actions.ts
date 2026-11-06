"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function logout() { const client = await createClient(); await client.auth.signOut({scope:"local"}); redirect("/login"); }
