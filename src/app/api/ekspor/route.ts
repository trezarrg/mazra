import { createClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/period";
import { officeRoles } from "@/lib/operations";
function cell(value:unknown){let text=String(value??"");if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export async function GET(request:Request){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return new Response("Silakan login.",{status:401});
 const {data:profile}=await db.from("profiles").select("role,active,profile_extra_roles(role)").eq("id",user.id).maybeSingle();if(!profile?.active||![profile.role,...(profile.profile_extra_roles??[]).map(r=>r.role)].some(r=>officeRoles.includes(r)))return new Response("Tidak memiliki akses.",{status:403});
 const params=new URL(request.url).searchParams;const q=Object.fromEntries(params);const period=resolvePeriod(q);const type=params.get("export");const finance=type==="finance";
 if(!["finance","sale","purchase"].includes(type??""))return new Response("Jenis ekspor tidak valid.",{status:400});
 const headers=finance?["Tanggal","Akun","Kategori","Nominal","Keterangan"]:["Tanggal","Dokumen","Mitra","Nilai","Status pembayaran"];
 const lines=[headers.map(cell).join(";")];let offset=0;
 while(true){
  let query=finance?db.from("finance_ledger").select("id,movement_date,account_name,category,amount,note,search_text,account_id,amount_value").order("movement_date").order("id"):db.from("transaction_history").select("id,document_date,reference,partner_name,amount,payment_state,search_text,partner_id,kind").eq("kind",type).order("document_date").order("id");
  const date=finance?"movement_date":"document_date";if(period.start)query=query.gte(date,period.start);if(period.end)query=query.lte(date,period.end);
  if(q.q)query=query.ilike("search_text",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
  if(finance){if(q.account)query=query.eq("account_id",q.account);if(q.category)query=query.eq("category",q.category);if(q.type==="in")query=query.gt("amount_value",0);if(q.type==="out")query=query.lt("amount_value",0);}else{if(q.partner)query=query.eq("partner_id",q.partner);if(q.status)query=query.eq("payment_state",q.status);}
  const {data,error}=await query.range(offset,offset+499);if(error)return new Response("Ekspor gagal. Coba lagi.",{status:500});
  for(const row of data??[]){const r=row as unknown as Record<string,unknown>;lines.push((finance?[r.movement_date,r.account_name,r.category,r.amount,r.note]:[r.document_date,r.reference,r.partner_name,r.amount,r.payment_state]).map(cell).join(";"));}
  if(!data||data.length<500)break;offset+=500;
 }
 return new Response("\uFEFF"+lines.join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="ayam-potong-${type}.csv"`,"Cache-Control":"no-store"}});
}
