import Link from "next/link";
import {requireAccess} from "@/lib/access";
import {businessToday,resolvePeriod,type Query} from "@/lib/period";
import {kindLabels,statusLabels,type Operation} from "@/lib/operations";
import {formatDate,formatDecimal} from "@/lib/format";
import {AppShell} from "@/components/app-shell";
import {PeriodFilter} from "@/components/period-filter";
import {Feedback,Pagination,pageNumber} from "@/components/query-ui";
import {EmptyState,ListRow,SectionHeading} from "@/components/ui";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles}=await requireAccess();const q=await searchParams;const period=resolvePeriod({...q,period:q.period??"all"});const page=pageNumber(q);
 let request=db.from("operation_list").select("*").order("operation_date",{ascending:false}).order("created_at",{ascending:false}).order("id");
 if(period.start)request=request.gte("operation_date",period.start);if(period.end)request=request.lte("operation_date",period.end);if(q.kind)request=request.eq("kind",q.kind);if(q.status)request=request.eq("status",q.status);if(q.q)request=request.ilike("search_text",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 const result=await request.range((page-1)*30,page*30);const list=(result.data??[])as(Operation&{partner_name:string|null})[];
 return <AppShell title="Dokumen operasional" active="more" role={role} roles={roles}><Feedback query={q} error={!!result.error}/><PeriodFilter compact period={period} today={businessToday()} search filters={[{name:"kind",label:"Jenis dokumen",options:[{value:"",label:"Semua jenis"},...Object.entries(kindLabels).filter(([value])=>["sale","production","adjustment","finance","transfer","deposit","payroll","advance","advance_repayment","sale_return","purchase_return","reversal"].includes(value)).map(([value,label])=>({value,label}))]},{name:"status",label:"Status",options:[{value:"",label:"Semua status"},...Object.entries(statusLabels).filter(([value])=>!["open","closed"].includes(value)).map(([value,label])=>({value,label}))]}]}/><SectionHeading title="Dokumen & draft"/><div className="list-card">{list.slice(0,30).map(d=><Link key={d.id} href={`/dokumen/${d.id}`}><ListRow title={`${kindLabels[d.kind]} #${d.document_no}`} subtitle={`${formatDate(d.operation_date)} · ${d.reversed_by?"Dikoreksi":statusLabels[d.status]}${d.partner_name?` · ${d.partner_name}`:""}`} icon="file" trailing={<strong>{d.kind==="production"?"Lihat":`Rp${formatDecimal(d.amount)}`}</strong>}/></Link>)}{!result.error&&!list.length&&<EmptyState title="Belum ada dokumen pada filter ini" icon="file"/>}</div><Pagination query={q} path="/dokumen" hasNext={list.length>30}/></AppShell>;
}
