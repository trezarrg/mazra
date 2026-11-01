import Link from "next/link";
import { CorrectionForm } from "@/components/correction-form";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { businessToday, type Query } from "@/lib/period";
import { kindLabels,statusLabels,officeRoles,paymentStatus,type Operation,type Item,type Obligation } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { Sheet } from "@/components/sheet";
import { OperationForm } from "@/components/operation-form";
import { PaymentForm,DeliveryForm } from "@/components/transaction-forms";
import { SubmitButton } from "@/components/submit-button";
import { Feedback } from "@/components/query-ui";
import { EmptyState,ListRow,Notice,SectionHeading } from "@/components/ui";
import { cancelDraft,verifyDeposit,uploadEvidence } from "@/app/operasi/actions";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Query>}) {
  const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))notFound();
  const {db,role,roles,user}=await requireAccess(); const query=await searchParams;const today=businessToday();const path=`/dokumen/${id}`;const office=roles.some(r=>officeRoles.includes(r));
  const result=await db.from("operation_details").select("*").eq("id",id).maybeSingle();
  if(result.error)return <AppShell title="Dokumen" active="more" role={role} roles={roles}><Notice error>Dokumen tidak dapat dimuat.</Notice></AppShell>;
  if(!result.data)notFound(); const doc=result.data as Operation;
  const [itemsResult,obligation,payments,related,delivery,attachments,options]=await Promise.all([
    db.from("item_details").select("*").eq("operation_id",id),
    doc.kind==="sale"?db.from("obligations").select("*").eq("source_id",id).maybeSingle():Promise.resolve({data:null,error:null}),
    doc.kind==="sale"?db.from("payment_records").select("id,payment_date,amount,note,reversed_by,account_name").eq("source_id",id).order("created_at"):Promise.resolve({data:[],error:null}),
    db.from("operation_details").select("id,kind,document_no,operation_date,amount,note,status,refund_amount").eq("source_id",id).order("created_at"),
    doc.kind==="sale"?db.from("delivery_events").select("id,event_date,stage,items,note,created_at").eq("sale_id",id).order("created_at"):Promise.resolve({data:[],error:null}),
    db.from("document_attachments").select("id,file_name,storage_path").eq("source_id",id),
    getFormOptions(db,user.id,office,["sale","production","adjustment"].includes(doc.kind)),
  ]);
  const items=(itemsResult.data??[]).map(i=>({...i,products:{name:i.product_name},product_variants:i.variant_name?{name:i.variant_name}:null})) as Item[];const bill=obligation.data as Obligation|null;
  const sourceItemsResult=doc.kind==="sale_return"&&doc.source_id?await db.from("operation_items").select("id,unit,quantity,products(name)").eq("operation_id",doc.source_id):null;
  const evidence=await Promise.all((attachments.data??[]).map(async a=>{const {data}=await db.storage.from("transaction-evidence").createSignedUrl(a.storage_path,300);return {...a,url:data?.signedUrl};}));
  const input=items.filter(i=>i.direction==="out").reduce((n,i)=>n+Number(i.unit==="kg"?i.quantity:i.actual_weight??0),0);
  const output=items.filter(i=>i.direction==="in").reduce((n,i)=>n+Number(i.unit==="kg"?i.quantity:i.actual_weight??0),0);
  const paymentAccounts=office?options.paymentAccounts??options.accounts:options.collectorAccounts??[];
  return <AppShell title={`${kindLabels[doc.kind]??"Dokumen"} #${doc.document_no}`} active={doc.kind==="sale"?"sale":"more"} role={role} roles={roles}>
    <Feedback query={query} error={[itemsResult,obligation,payments,related,delivery,attachments].some(r=>!!r.error)||options.error}/>
    <div className="document-summary"><span className="badge badge-green">{doc.reversed_by?"Dikoreksi":statusLabels[doc.status]}</span><p>{formatDate(doc.operation_date)}</p>{doc.kind!=="production"&&<strong>Rp{formatDecimal(doc.amount)}</strong>}{doc.note&&<p>{doc.note}</p>}<small>Dibuat {new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(doc.created_at))} · Pengguna {doc.created_by===user.id?"Anda":doc.created_by.slice(0,8)}</small>{doc.source_id&&<Link className="text-link" href={doc.kind==="purchase_return"?`/pembelian?receipt=${doc.source_id}&period=all`:`/dokumen/${doc.source_id}`}>Buka dokumen asal</Link>}</div>
    {doc.reversed_by&&<Notice>Dokumen ini sudah dibalik. <Link href={`/dokumen/${doc.reversed_by}`} className="text-link">Lihat koreksi</Link></Notice>}
    {doc.status==="draft"&&(office||doc.created_by===user.id)&&<><SectionHeading title="Lanjutkan draft"/>{["sale","production","adjustment","sale_return","purchase_return","finance","transfer","deposit"].includes(doc.kind)&&<OperationForm id={id} kind={doc.kind} today={today} options={options} initial={doc.payload} returnTo={path} sourceItems={(sourceItemsResult?.data??[]).map(i=>({value:i.id,label:`${(i.products as unknown as {name:string})?.name} · ${formatDecimal(i.quantity)} ${i.unit}`,unit:i.unit}))}/>}<form action={cancelDraft} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="return_to" value={path}/><SubmitButton secondary>Batalkan draft</SubmitButton></form></>}
    {doc.kind==="production"&&doc.status==="final"&&<p className="calculation">Bahan {formatDecimal(input.toFixed(3))} kg · Hasil {formatDecimal(output.toFixed(3))} kg · Selisih {formatDecimal((output-input).toFixed(3))} kg ({input?formatDecimal(((output-input)/input*100).toFixed(2)):"0"}%)</p>}
    {items.length>0&&<><SectionHeading title="Rincian item"/><div className="list-card">{items.map(i=><div key={i.id}><ListRow title={`${i.products?.name??"Produk"}${i.product_variants?.name?` · ${i.product_variants.name}`:""}`} subtitle={`${i.direction==="out"?"Keluar":"Masuk"}${doc.kind==="sale"?` · Rp${formatDecimal(i.price)} / ${i.unit}`:""}${i.actual_weight?` · Timbang ${formatDecimal(i.actual_weight)} kg`:""}`} trailing={<strong>{formatDecimal(i.quantity)} {i.unit}</strong>}/></div>)}</div></>}
    {bill&&<><SectionHeading title="Pembayaran" action={Number(bill.balance)>0&&(office||roles.includes("collector"))&&<Sheet title="Catat pembayaran" trigger="Bayar"><PaymentForm id={randomUUID()} bill={bill} today={today} accounts={paymentAccounts} returnTo={path}/></Sheet>}/><div className="document-summary"><span className="badge">{paymentStatus(bill,today)}</span><p>Terbayar Rp{formatDecimal(bill.paid)} · Retur Rp{formatDecimal(bill.credited)}</p><strong>Sisa Rp{formatDecimal(bill.balance)}</strong>{bill.due_date&&<p>Jatuh tempo {formatDate(bill.due_date)}</p>}</div><div className="list-card">{payments.data?.map(p=><div key={p.id}><ListRow title={`Rp${formatDecimal(p.amount)}`} subtitle={`${p.reversed_by?"Dikoreksi · ":""}${formatDate(p.payment_date)} · ${p.account_name??"Akun"}${p.note?` · ${p.note}`:""}`} icon="wallet"/>{office&&!p.reversed_by&&<CorrectionForm source={p.id} kind="payment" today={today} returnTo={path}/>}</div>)}</div></>}
    {doc.kind==="sale"&&doc.status==="final"&&<><SectionHeading title="Pengiriman" action={(office||roles.includes("driver"))&&<Sheet title="Catat realisasi pengiriman" trigger="Catat"><DeliveryForm id={randomUUID()} saleId={id} today={today} items={items} returnTo={path}/></Sheet>}/><div className="list-card">{delivery.data?.map(d=><div className="document-entry" key={d.id}><strong>{d.stage==="sent"?"Dikirim":"Diterima"} · {formatDate(d.event_date)}</strong>{(d.items as {item:string;quantity:string}[]).map((entry,index)=><p key={index}>{items.find(i=>i.id===entry.item)?.products?.name} · {formatDecimal(entry.quantity)} {items.find(i=>i.id===entry.item)?.unit}</p>)}{d.note&&<p>{d.note}</p>}</div>)}{!delivery.error&&!delivery.data?.length&&<EmptyState title="Belum ada pengiriman" icon="file"/>}</div>
    {items.map(item=>{const sum=(stage:string)=>(delivery.data??[]).filter(d=>d.stage===stage).reduce((n,d)=>n+(d.items as {item:string;quantity:string}[]).filter(x=>x.item===item.id).reduce((v,x)=>v+Number(x.quantity),0),0);const sent=sum("sent"),received=sum("received");return sent>0?<p className="caption" key={item.id}>{item.products?.name}: dikirim {formatDecimal(sent.toFixed(3))} {item.unit} · diterima {formatDecimal(received.toFixed(3))} {item.unit} · sisa / selisih belum diterima {formatDecimal((sent-received).toFixed(3))} {item.unit}</p>:null;})}
    {office&&<details className="form-details"><summary>Retur / koreksi penjualan</summary><p className="caption">Retur mengembalikan stok dan mengurangi tagihan. Untuk koreksi, retur bagian yang salah lalu buat penjualan pengganti dengan referensi dokumen ini. Dana yang sudah terbayar dikembalikan dari akun yang dipilih.</p><OperationForm id={randomUUID()} kind="sale_return" today={today} options={options} initial={{source:id}} sourceItems={items.map(i=>({value:i.id,label:`${i.products?.name} · ${formatDecimal(i.quantity)} ${i.unit}`,unit:i.unit}))} returnTo={path}/></details>}</>}
    {doc.kind==="deposit"&&doc.status==="pending"&&office&&<><SectionHeading title="Verifikasi setoran"/>{doc.created_by===user.id?<Notice>Setoran Anda harus diverifikasi pengguna lain.</Notice>:<form action={verifyDeposit} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="return_to" value={path}/><label>Keterangan verifikasi<textarea name="note" maxLength={1000}/></label><div className="form-buttons"><SubmitButton name="accept" value="no" secondary>Tolak</SubmitButton><SubmitButton name="accept" value="yes">Terima dan verifikasi</SubmitButton></div></form>}</>}
    {doc.kind==="payroll"&&<div className="document-summary">{[["Gaji pokok","base"],["Lembur","overtime"],["Bonus","bonus"],["Potongan","deduction"],["Potongan kasbon","advance_deduction"]].map(([label,key])=><p key={key}>{label}: Rp{formatDecimal(String(doc.payload[key]||"0"))}</p>)}<p>Periode {String(doc.payload.period_start)} sampai {String(doc.payload.period_end)}</p></div>}
    {Number(doc.refund_amount)>0&&<Notice>Pengembalian dana Rp{formatDecimal(doc.refund_amount)} sudah dicatat di buku keuangan.</Notice>}
    {!!related.data?.length&&<><SectionHeading title="Dokumen terkait"/><div className="list-card">{related.data.map(r=><Link key={r.id} href={`/dokumen/${r.id}`}><ListRow title={`${kindLabels[r.kind]} #${r.document_no}`} subtitle={`${formatDate(r.operation_date)} · ${statusLabels[r.status]}`} trailing={<strong>Rp{formatDecimal(r.amount)}</strong>}/></Link>)}</div></>}
    {office&&!doc.reversed_by&&doc.kind!=="sale"&&doc.kind!=="reversal"&&["final","verified"].includes(doc.status)&&<CorrectionForm source={id} kind="operation" today={today} returnTo={path}/>}
    <SectionHeading title="Bukti transaksi"/><div className="document-summary">{evidence.map(a=>a.url?<a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="text-link">{a.file_name}</a>:<p key={a.id}>Bukti tidak dapat dibuka.</p>)}<form action={uploadEvidence} className="form"><input type="hidden" name="source" value={id}/><input type="hidden" name="return_to" value={path}/><label>Lampiran (PDF/JPG/PNG, maks. 10 MB)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required/></label><SubmitButton secondary>Unggah bukti</SubmitButton></form></div>
  </AppShell>;
}
