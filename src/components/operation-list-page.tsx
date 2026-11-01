import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { getFormOptions } from "@/lib/form-options";
import { kindLabels, statusLabels, officeRoles, type Operation } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "./app-shell";
import { PeriodFilter } from "./period-filter";
import { OperationForm } from "./operation-form";
import { Sheet } from "./sheet";
import { EmptyState,ListRow,SectionHeading } from "./ui";
import { Feedback,Pagination,pageNumber } from "./query-ui";
export async function OperationListPage({query,kind,title,path}:{query:Query;kind:string;title:string;path:string}) {
  const {db,role,roles,user}=await requireAccess([...officeRoles,...(kind==="production"?["production"]:kind==="deposit"?["collector"]:kind==="sale"?["collector","driver"]:[])]);
  const office=roles.some(r=>officeRoles.includes(r));const today=businessToday();const period=resolvePeriod(query);const page=pageNumber(query);
  let request=db.from("operation_list").select("*").eq("kind",kind).order("operation_date",{ascending:false}).order("created_at",{ascending:false});
  if(period.start)request=request.gte("operation_date",period.start);if(period.end)request=request.lte("operation_date",period.end);
  if(query.status&&["draft","final","pending","verified","cancelled"].includes(query.status))request=request.eq("status",query.status);
  if(query.partner)request=request.eq("partner_id",query.partner);
  if(query.q)request=request.ilike("search_text",`%${query.q.replace(/[%_]/g,"").slice(0,100)}%`);
  const [result,options]=await Promise.all([request.range((page-1)*30,page*30),getFormOptions(db,user.id,office,kind==="sale"||kind==="production")]);
  const list=(result.data??[]) as (Operation & {partner_name:string|null})[];const canAdd=office||kind==="production"||kind==="deposit";
  const cash=kind==="deposit"?await db.from("cash_balances").select("account_id,account_name,balance"):null;
  return <AppShell title={title} active={kind==="sale"?"sale":kind==="deposit"?"finance":"stock"} role={role} roles={roles}><Feedback query={query} error={!!result.error||options.error||!!cash?.error}/>
    {kind==="deposit"&&!cash?.error&&!!options.collectorAccounts?.length&&<div className="summary-grid">{options.collectorAccounts.map(a=><div className="summary-card" key={a.value}><span>{a.label} · saldo dalam penguasaan Anda</span><strong>Rp{formatDecimal(cash?.data?.find(c=>c.account_id===a.value)?.balance??"0")}</strong></div>)}</div>}
    <PeriodFilter compact={kind==="sale"} period={period} today={today} search filters={[{name:"status",label:"Status",options:[{value:"",label:"Semua status"},...["draft","final","pending","verified","cancelled"].map(value=>({value,label:statusLabels[value]}))]},...(kind==="sale"&&office?[{name:"partner",label:"Pelanggan",options:[{value:"",label:"Semua pelanggan"},...options.partners]}]:[])]}/>
    <SectionHeading title={kind==="sale"?"Transaksi":kind==="production"?"Hasil potong & konversi":"Daftar setoran"} action={canAdd&&<Sheet title={kind==="sale"?"Penjualan baru":kind==="production"?"Catat hasil potong":"Ajukan setoran"} trigger="Tambah"><OperationForm id={randomUUID()} kind={kind} today={today} options={options} returnTo={path}/></Sheet>}/>
    <div className="list-card">{list.slice(0,30).map(o=><Link key={o.id} href={`/dokumen/${o.id}`} className="row-button"><ListRow title={`${kind==="sale"?o.partner_name||kindLabels[kind]:kindLabels[kind]} #${o.document_no}`} subtitle={`${formatDate(o.operation_date)} · ${o.reversed_by?"Dikoreksi":statusLabels[o.status]}`} icon={kind==="deposit"?"wallet":"file"} trailing={<strong>{kind==="production"?"Lihat":`Rp${formatDecimal(o.amount)}`}</strong>}/></Link>)}{!result.error&&!list.length&&<EmptyState title="Belum ada transaksi pada periode ini" icon="file"/>}</div><Pagination query={query} path={path} hasNext={list.length>30}/>
  </AppShell>;
}
