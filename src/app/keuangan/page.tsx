import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import { officeRoles,kindLabels } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { OperationForm } from "@/components/operation-form";
import { Sheet } from "@/components/sheet";
import { EmptyState,ListRow,Notice,SectionHeading } from "@/components/ui";
import { Feedback,Pagination,pageNumber } from "@/components/query-ui";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { saveCategory } from "@/app/operasi/actions";
export default async function Page({searchParams}:{searchParams:Promise<Query>}) {
 const {db,role,roles,user}=await requireAccess(officeRoles);const q=await searchParams;const today=businessToday();const period=resolvePeriod(q);const page=pageNumber(q);
 let request=db.from("finance_ledger").select("*").order("movement_date",{ascending:false}).order("created_at",{ascending:false});
 if(period.start)request=request.gte("movement_date",period.start);if(period.end)request=request.lte("movement_date",period.end);
 if(q.account)request=request.eq("account_id",q.account);if(q.category)request=request.eq("category",q.category);if(q.type==="in")request=request.gt("amount_value",0);if(q.type==="out")request=request.lt("amount_value",0);
 if(q.q)request=request.ilike("search_text",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 const [ledger,options,drafts,accounts]=await Promise.all([request.range((page-1)*40,page*40),getFormOptions(db,user.id,true,false),db.from("operations").select("id,document_no,kind").in("kind",["finance","transfer"]).eq("status","draft").order("created_at",{ascending:false}).limit(20),db.from("cash_accounts").select("id,name").order("name")]);
 const list=ledger.data??[];
 return <AppShell title="Buku keuangan" active="finance" role={role} roles={roles}><Feedback query={q} error={!!ledger.error||options.error||!!accounts.error||!!drafts.error}/><div className="toolbar finance-actions"><Sheet title="Catat keuangan" trigger="Catat kas"><OperationForm id={randomUUID()} kind="finance" today={today} options={options} returnTo="/keuangan"/></Sheet><Sheet title="Transfer antarakun" className="button button-secondary" trigger="Transfer"><OperationForm id={randomUUID()} kind="transfer" today={today} options={options} returnTo="/keuangan"/></Sheet></div>
 <PeriodFilter compact period={period} today={today} search filters={[{name:"account",label:"Akun",options:[{value:"",label:"Semua akun"},...(accounts.data??[]).map(a=>({value:a.id,label:a.name}))]},{name:"category",label:"Kategori",options:[{value:"",label:"Semua kategori"},...(options.categories??[]),{value:"customer_payment",label:"Pembayaran pelanggan"},{value:"supplier_payment",label:"Pembayaran supplier"},{value:"transfer",label:"Transfer"}]},{name:"type",label:"Arus uang",options:[{value:"",label:"Semua"},{value:"in",label:"Masuk"},{value:"out",label:"Keluar"}]}]}/>
 <p className="caption">Pembayaran penjualan/pembelian dicatat otomatis. Modal, pinjaman, aset, dan prive mengikuti kategori masing-masing.</p>
 {!!drafts.data?.length&&<><SectionHeading title="Draft belum diposting"/><div className="list-card">{drafts.data.map(d=><Link key={d.id} href={`/dokumen/${d.id}`}><ListRow title={`${kindLabels[d.kind]} #${d.document_no}`} subtitle="Draft" icon="file"/></Link>)}</div></>}
 <SectionHeading title="Arus kas & bank" action={<a className="text-link" href={`/api/ekspor?export=finance&${new URLSearchParams(Object.entries(q).filter((entry):entry is [string,string]=>typeof entry[1]==="string"))}`}>Ekspor CSV</a>}/><div className="list-card">{list.slice(0,40).map(l=><div key={l.id}>{l.source_id?<Link href={l.source_type==="payment"?`/tagihan?period=all`:`/dokumen/${l.source_id}`}><ListRow title={l.category_name||kindLabels[l.source_type]||"Gerakan kas"} subtitle={`${formatDate(l.movement_date)} · ${l.account_name}${l.note?` · ${l.note}`:""}`} icon="wallet" trailing={<strong className={Number(l.amount)<0?"amount-negative":"amount-positive"}>{Number(l.amount)>0?"+":""}Rp{formatDecimal(l.amount)}</strong>}/></Link>:<ListRow title={kindLabels[l.source_type]||"Gerakan kas"} subtitle={`${formatDate(l.movement_date)} · ${l.account_name}`} icon="wallet" trailing={<strong>Rp{formatDecimal(l.amount)}</strong>}/>}</div>)}{!ledger.error&&!list.length&&<EmptyState title="Belum ada arus uang pada periode ini" icon="wallet"/>}</div><Pagination query={q} hasNext={list.length>40} path="/keuangan"/>
 {roles.some(r=>["developer","owner"].includes(r))&&<details className="form-details"><summary>Tambah kategori keuangan</summary><form action={saveCategory} className="form"><input type="hidden" name="return_to" value="/keuangan"/><label>Kode kategori<input name="code" pattern="custom_[a-z0-9_]{1,30}" placeholder="custom_biaya_kebersihan" required/></label><label>Nama<input name="name" maxLength={100} required/></label><Dropdown label="Arah" name="direction" options={[{value:"out",label:"Keluar"},{value:"in",label:"Masuk"}]}/><Dropdown label="Klasifikasi" name="classification" options={[{value:"expense",label:"Biaya usaha"},{value:"income",label:"Pendapatan usaha lain"},{value:"equity",label:"Modal"},{value:"owner",label:"Prive"}]}/><label className="checkbox"><input type="checkbox" name="active" defaultChecked/>Aktif</label><SubmitButton>Simpan kategori</SubmitButton></form></details>}
 <Notice>Saldo awal lama tetap tercatat. Tinjau saldo sebelum mulai memakai aplikasi sebagai pembukuan usaha.</Notice>
 </AppShell>;
}
