import { cache } from "react";
import { branding } from "./branding";
import { createClient } from "@supabase/supabase-js";

export function businessLogoUrl(path?: string | null) {
  if (!path || !/^logos\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) return branding.logo;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/business-branding/${path}`;
}

export const getBusinessBranding = cache(async () => {
  try {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!url || !key) return branding;
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const { data, error } = await db.rpc("public_business_branding");
    if (error || !data) return branding;
    return { name: typeof data.name === "string" && data.name.trim() ? data.name : branding.name, logo: businessLogoUrl(data.logo_path) };
  } catch { return branding; }
});
