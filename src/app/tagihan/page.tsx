import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import { getFormOptions } from "@/lib/form-options";
import { officeRoles,paymentStatus,type Obligation } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { PaymentForm } from "@/components/transaction-forms";
import { EmptyState,SectionHeading,Tabs } from "@/components/ui";
import { Feedback,Pagination,pageNumber } from "@/components/query-ui";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles,user}=await requireAccess([...officeRoles,"collector"]);const q=await searchParams;const office=roles.some(r=>officeRoles.includes(r));const kind=q.tab==="hutang"&&office?"payable":"receivable";const today=businessToday();const period=resolvePeriod({...q,period:q.period??"all"});const page=pageNumber(q);
 let request=db.from("obligations").select("*").eq("kind",kind).order("document_date",{ascending:false}).order("source_id");
 if(period.start)request=request.gte("document_date",period.start);if(period.end)request=request.lte("document_date",period.end);
 if(q.q)request=request.ilike("partner_name",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 if(q.status==="open")request=request.gt("balance_amount",0);else if(q.status==="paid")request=request.eq("balance_amount",0);else if(q.status==="overdue")request=request.gt("balance_amount",0).lt("due_date",today);
 const [result,options]=await Promise.all([request.range((page-1)*30,page*30),getFormOptions(db,user.id,office,false)]);const bills=(result.data??[]) as Obligation[];
 const tab=kind==="payable"?"hutang":"piutang";const path=`/tagihan?tab=${tab}`;
 return <AppShell title="Piutang & hutang" active="finance" role={role} roles={roles}><Feedback query={q} error={!!result.error||options.error}/>{office&&<Tabs active={tab} items={[{id:"piutang",label:"Piutang pelanggan",href:"/tagihan?tab=piutang"},{id:"hutang",label:"Hutang supplier",href:"/tagihan?tab=hutang"}]}/>}<PeriodFilter period={period} today={today} search filters={[{name:"status",label:"Pembayaran",options:[{value:"",label:"Semua"},{value:"open",label:"Belum lunas"},{value:"paid",label:"Lunas"},{value:"overdue",label:"Lewat tempo"}]}]}/><SectionHeading title={kind==="payable"?"Tagihan supplier":"Tagihan pelanggan"}/><div className="transaction-grid">{bills.slice(0,30).map(b=><article className="transaction-card" key={b.source_id}><div><strong>{b.partner_name}</strong><span className="badge">{paymentStatus(b,today)}</span></div><p>{b.reference} · {formatDate(b.document_date)}</p>{b.due_date&&<p>Jatuh tempo {formatDate(b.due_date)}</p>}<p>Total Rp{formatDecimal(b.total)} · Terbayar Rp{formatDecimal(b.paid)}</p><strong>Sisa Rp{formatDecimal(b.balance)}</strong><div className="card-actions"><Link className="text-link" href={kind==="payable"?`/pembelian?period=all&receipt=${b.source_id}`:`/dokumen/${b.source_id}`}>Lihat dokumen</Link>{Number(b.balance)>0&&<Sheet title={`Bayar ${b.reference}`} trigger="Bayar"><PaymentForm id={randomUUID()} bill={b} today={today} accounts={office&&kind==="receivable"?options.paymentAccounts??options.accounts:office?options.accounts:options.collectorAccounts??[]} returnTo={path}/></Sheet>}</div></article>)}</div>{!result.error&&!bills.length&&<EmptyState title="Belum ada tagihan" icon="file"/>}<Pagination query={q} path="/tagihan" hasNext={bills.length>30}/></AppShell>;
}
