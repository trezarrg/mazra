import { createClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/period";
import { officeRoles } from "@/lib/operations";
import {formatDecimal} from "@/lib/format";
function cell(value:unknown){let text=String(value??"");if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export async function GET(request:Request){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return new Response("Silakan login.",{status:401});
 const {data:profile}=await db.from("profiles").select("role,active,profile_extra_roles(role)").eq("id",user.id).maybeSingle();if(!profile?.active||![profile.role,...(profile.profile_extra_roles??[]).map(r=>r.role)].some(r=>officeRoles.includes(r)))return new Response("Tidak memiliki akses.",{status:403});
 const params=new URL(request.url).searchParams;const q=Object.fromEntries(params);const period=resolvePeriod(q);const type=params.get("export");const finance=type==="finance";
 if(!["finance","sale","purchase","stock"].includes(type??""))return new Response("Jenis ekspor tidak valid.",{status:400});
 const stock=type==="stock";
 const headers=stock?["Tanggal","Produk","Varian","Gerakan kg","Sumber kg","Gerakan jumlah","Satuan jumlah","Sumber jumlah","Referensi stok","Kejadian","Alasan","Lokasi"]:finance?["Tanggal","Akun","Kategori","Nominal","Keterangan"]:["Tanggal","Dokumen","Mitra","Nilai","Status pembayaran","Ukuran barang"];
 const lines=[headers.map(cell).join(";")];let offset=0;
 while(true){
  let query=stock?db.from("stock_measured_history").select("*").order("movement_date").order("id"):finance?db.from("finance_ledger").select("id,movement_date,account_name,category,amount,note,search_text,account_id,amount_value").order("movement_date").order("id"):db.from("transaction_history").select("id,document_date,reference,partner_name,amount,payment_state,search_text,partner_id,kind").eq("kind",type).order("document_date").order("id");
  const date=finance||stock?"movement_date":"document_date";if(period.start)query=query.gte(date,period.start);if(period.end)query=query.lte(date,period.end);
  if(q.q)query=query.ilike(stock?"product_name":"search_text",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
  if(finance){if(q.account)query=query.eq("account_id",q.account);if(q.category)query=query.eq("category",q.category);if(q.type==="in")query=query.gt("amount_value",0);if(q.type==="out")query=query.lt("amount_value",0);}else if(!stock){if(q.partner)query=query.eq("partner_id",q.partner);if(q.status)query=query.eq("payment_state",q.status);else query=query.neq("payment_state","cancelled");}
  const {data,error}=await query.range(offset,offset+499);if(error)return new Response("Ekspor gagal. Coba lagi.",{status:500});
  const sizes=new Map<string,string>();
  if(!finance&&!stock&&data?.length){
   const ids=data.map(row=>String(row.id));
   if(type==="sale"){
    const items=await db.from("item_details").select("operation_id,product_name,variant_name,unit,quantity,actual_weight,piece_count,count_unit,weight_source,count_source").in("operation_id",ids).order("id");
    if(items.error)return new Response("Rincian ekspor belum lengkap.",{status:500});
    for(const i of items.data??[]){const text=`${i.product_name}${i.variant_name?` (${i.variant_name})`:""}: ${i.unit==="kg"&&i.weight_source==="estimated"?"± ":""}${formatDecimal(i.quantity)} ${i.unit}${i.unit==="kg"&&i.piece_count?` / ${i.count_source==="estimated"?"± ":""}${formatDecimal(i.piece_count)} ${i.count_unit??"ekor/pcs"}`:i.actual_weight?` / ${i.weight_source==="estimated"?"± ":""}${formatDecimal(i.actual_weight)} kg`:""}`;sizes.set(i.operation_id,[sizes.get(i.operation_id),text].filter(Boolean).join(" | "));}
   }else{
    const receipts=await db.from("purchase_receipt_measured_list").select("id,actual_weight,measurement").in("id",ids);
    if(receipts.error)return new Response("Rincian ekspor belum lengkap.",{status:500});
    for(const r of receipts.data??[]){const m=r.measurement;sizes.set(r.id,`${m?.weight_source==="estimated"?"± ":""}${formatDecimal(r.actual_weight)} kg${m?.weight_source?` (${m.weight_source})`:""}${m?.count?` / ${m.count_source==="estimated"?"± ":""}${formatDecimal(m.count)} ${m.count_unit??"ekor/pcs"}`:""}`);}
   }
  }
  for(const row of data??[]){const r=row as unknown as Record<string,unknown>;lines.push((stock?[r.movement_date,r.product_name,r.variant_name,r.quantity,r.weight_source??"unknown",r.count_delta,r.count_unit,r.count_source,r.stock_reference,r.stock_event??r.source_type,r.loss_reason,r.location]:finance?[r.movement_date,r.account_name,r.category,r.amount,r.note]:[r.document_date,r.reference,r.partner_name,r.amount,r.payment_state,sizes.get(String(r.id))??""]).map(cell).join(";"));}
  if(!data||data.length<500)break;offset+=500;
 }
 return new Response("\uFEFF"+lines.join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="ayam-potong-${type}.csv"`,"Cache-Control":"no-store"}});
}
