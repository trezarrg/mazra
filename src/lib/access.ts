import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAccess(roles?: string[]) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role, active, profile_extra_roles(role)").eq("id", user.id).maybeSingle();
  const userRoles = profile ? [profile.role, ...(profile.profile_extra_roles ?? []).map(r => r.role)] : [];
  if (!profile?.active || (roles && !roles.some(role => userRoles.includes(role)))) redirect("/?error=access");
  return { db, user, role: profile.role as string, roles: userRoles };
}
