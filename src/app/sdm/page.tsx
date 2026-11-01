import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import { officeRoles,kindLabels } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { EmptyState,ListRow,SectionHeading } from "@/components/ui";
import { Feedback,Pagination,pageNumber } from "@/components/query-ui";
import { EmployeeForm,HRForm,type Employee } from "./forms";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles,user}=await requireAccess(officeRoles);const q=await searchParams;const today=businessToday();const period=resolvePeriod(q,today,true);const page=pageNumber(q);
 let request=db.from("operations").select("id,kind,document_no,operation_date,amount,payload").in("kind",["payroll","advance","advance_repayment"]).eq("status","final").order("operation_date",{ascending:false}).order("created_at",{ascending:false});if(period.start)request=request.gte("operation_date",period.start);if(period.end)request=request.lte("operation_date",period.end);
 const [employees,balances,history,options]=await Promise.all([db.from("employees").select("*").order("name"),db.from("employee_balances").select("id,advance_balance"),request.range((page-1)*30,page*30),getFormOptions(db,user.id,true,false)]);const workers=(employees.data??[]) as Employee[];const list=history.data??[];
 return <AppShell title="SDM" active="more" role={role} roles={roles}><Feedback query={q} error={[employees,balances,history].some(r=>!!r.error)||options.error}/><div className="toolbar">{[["payroll","Bayar gaji"],["advance","Kasbon"],["advance_repayment","Pengembalian kasbon"]].map(([kind,label])=><Sheet key={kind} title={label} trigger={label} className={kind==="payroll"?"button button-primary":"button button-secondary"}><HRForm id={randomUUID()} kind={kind} today={today} accounts={options.accounts} employees={workers.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))}/></Sheet>)}</div><SectionHeading title="Pekerja & sisa kasbon" action={<Sheet title="Pekerja baru" trigger="Tambah"><EmployeeForm id={randomUUID()}/></Sheet>}/><div className="list-card">{workers.map(e=><Sheet key={e.id} title={e.name} className="row-button" trigger={<ListRow title={e.name} subtitle={`${e.job_title??"Pekerja"} · ${e.active?"Aktif":"Nonaktif"}`} icon="users" trailing={<strong>Rp{formatDecimal(balances.data?.find(b=>b.id===e.id)?.advance_balance??"0")}</strong>}/>}><EmployeeForm id={e.id} employee={e}/></Sheet>)}{!employees.error&&!workers.length&&<EmptyState title="Belum ada pekerja" icon="users"/>}</div><SectionHeading title="Riwayat gaji & kasbon"/><PeriodFilter compact period={period} today={today}/><div className="list-card">{list.slice(0,30).map(h=><Link key={h.id} href={`/dokumen/${h.id}`}><ListRow title={`${kindLabels[h.kind]} · ${workers.find(e=>e.id===(h.payload as {employee:string}).employee)?.name??"Pekerja"}`} subtitle={formatDate(h.operation_date)} icon="wallet" trailing={<strong>Rp{formatDecimal(h.amount)}</strong>}/></Link>)}{!history.error&&!list.length&&<EmptyState title="Belum ada pembayaran pada periode ini" icon="wallet"/>}</div><Pagination query={q} path="/sdm" hasNext={list.length>30}/></AppShell>;
}
