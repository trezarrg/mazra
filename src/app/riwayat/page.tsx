import Link from "next/link";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { EmptyState,ListRow,Tabs,SectionHeading } from "@/components/ui";
import { Feedback,Pagination,pageNumber } from "@/components/query-ui";
export default async function Page({searchParams}:{searchParams:Promise<Query>}) {
 const {db,role,roles}=await requireAccess(officeRoles);const q=await searchParams;const kind=q.tab==="pembelian"?"purchase":"sale";const tab=kind==="sale"?"penjualan":"pembelian";const period=resolvePeriod(q);const page=pageNumber(q);
 let request=db.from("transaction_history").select("*").eq("kind",kind).order("document_date",{ascending:false}).order("id");
 if(period.start)request=request.gte("document_date",period.start);if(period.end)request=request.lte("document_date",period.end);if(q.partner)request=request.eq("partner_id",q.partner);if(q.status)request=request.eq("payment_state",q.status);if(q.q)request=request.ilike("search_text",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 const [result,partners]=await Promise.all([request.range((page-1)*30,page*30),db.from("partners").select("id,name").eq(kind==="sale"?"is_customer":"is_supplier",true).order("name")]);const list=result.data??[];
 return <AppShell title="Riwayat" active="more" role={role} roles={roles}><Feedback query={q} error={!!result.error||!!partners.error}/><Tabs active={tab} items={[{id:"penjualan",label:"Penjualan",href:"/riwayat?tab=penjualan"},{id:"pembelian",label:"Pembelian",href:"/riwayat?tab=pembelian"}]}/><PeriodFilter period={period} today={businessToday()} search filters={[{name:"partner",label:"Mitra",options:[{value:"",label:"Semua mitra"},...(partners.data??[]).map(p=>({value:p.id,label:p.name}))]},{name:"status",label:"Pembayaran",options:[{value:"",label:"Semua"},{value:"draft",label:"Draft"},{value:"unpaid",label:"Belum bayar"},{value:"partial",label:"Sebagian"},{value:"paid",label:"Lunas"}]}]}/><SectionHeading title="Dokumen transaksi" action={<a className="text-link" href={`/api/ekspor?export=${kind}&${new URLSearchParams(Object.entries(q).filter((e):e is [string,string]=>typeof e[1]==="string"))}`}>Ekspor CSV</a>}/><div className="list-card">{list.slice(0,30).map(t=><Link key={t.id} href={kind==="sale"?`/dokumen/${t.document_id}`:`/pembelian?period=all&receipt=${t.id}`}><ListRow title={`${t.partner_name} · ${t.reference}`} subtitle={`${formatDate(t.document_date)} · ${{paid:"Lunas",partial:"Sebagian",unpaid:"Belum bayar",draft:"Draft"}[String(t.payment_state)]??t.status}`} icon="file" trailing={<strong>Rp{formatDecimal(t.amount)}</strong>}/></Link>)}{!result.error&&!list.length&&<EmptyState title="Belum ada transaksi pada periode ini" icon="clock"/>}</div><Pagination query={q} hasNext={list.length>30} path="/riwayat"/></AppShell>;
}
