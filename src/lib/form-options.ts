import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormOptions } from "@/components/operation-form";
import type { Product } from "./operations";
export async function getFormOptions(db: SupabaseClient, userId: string, office = true, stock = true): Promise<FormOptions & { error: boolean }> {
  const [products,partners,accounts,people,categories,assets,units] = await Promise.all([
    stock ? db.from("products").select("id,name,product_units(unit),product_variants(id,name,active)").eq("active",true).order("name") : Promise.resolve({data:[],error:null}),
    office ? db.from("partners").select("id,name").eq("active",true).eq("is_customer",true).order("name") : Promise.resolve({data:[],error:null}),
    db.from("cash_accounts").select("id,name,account_type,holder_id").eq("active",true).order("name"),
    office ? db.from("profiles").select("id,full_name,role,profile_extra_roles(role)").eq("active",true) : Promise.resolve({data:[],error:null}),
    office ? db.from("finance_categories").select("code,name,direction").eq("active",true).order("name") : Promise.resolve({data:[],error:null}),
    office ? db.from("fixed_assets").select("id,name").is("disposed_by",null).order("name") : Promise.resolve({data:[],error:null}),
    stock ? db.from("unit_catalog").select("code").eq("active",true) : Promise.resolve({data:[],error:null}),
  ]);
  const activeUnits=new Set((units.data??[]).map(u=>u.code));
  return { error:[products,partners,accounts,people,categories,assets,units].some(r=>!!r.error),
    products:((products.data??[]) as Product[]).map(p=>({...p,product_units:p.product_units.filter(u=>activeUnits.has(u.unit))})),
    partners:(partners.data??[]).map(p=>({value:p.id,label:p.name})),
    accounts:(accounts.data??[]).filter(a=>a.account_type!=="collector").map(a=>({value:a.id,label:a.name})),
    collectorAccounts:(accounts.data??[]).filter(a=>a.account_type==="collector"&&a.holder_id===userId).map(a=>({value:a.id,label:a.name})),
    paymentAccounts:(accounts.data??[]).map(a=>({value:a.id,label:a.name})),
    assignees:(people.data??[]).filter(p=>[p.role,...(p.profile_extra_roles??[]).map((r:{role:string})=>r.role)].some(r=>r==="driver"||r==="collector")).map(p=>({value:p.id,label:p.full_name})),
    collectors:(people.data??[]).filter(p=>p.role==="collector"||(p.profile_extra_roles??[]).some((r:{role:string})=>r.role==="collector")).map(p=>({value:p.id,label:p.full_name})),
    drivers:(people.data??[]).filter(p=>p.role==="driver"||(p.profile_extra_roles??[]).some((r:{role:string})=>r.role==="driver")).map(p=>({value:p.id,label:p.full_name})),
    categories:(categories.data??[]).map(c=>({value:c.code,label:c.name,direction:c.direction})),assets:(assets.data??[]).map(a=>({value:a.id,label:a.name})),
  };
}
