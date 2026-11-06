import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

export async function requireAccess(roles?: string[]) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if(error && (isAuthRetryableFetchError(error) || error.status===0 || (error.status??0)>=500)) throw new Error("Layanan masuk sedang tidak dapat dihubungi. Coba kembali.");
  if (error || !user) redirect("/login");
  const { data: profile, error:profileError } = await db.from("profiles").select("role, active, profile_extra_roles(role)").eq("id", user.id).maybeSingle();
  if(profileError) throw new Error("Akses akun belum dapat diperiksa. Coba kembali.");
  const userRoles = profile ? [profile.role, ...(profile.profile_extra_roles ?? []).map(r => r.role)] : [];
  if (!profile?.active) redirect("/login?error=access");
  if (roles && !roles.some(role => userRoles.includes(role))) redirect("/?error=access");
  return { db, user, role: profile.role as string, roles: userRoles };
}
