import { requireAccess } from "@/lib/access";
import { redirect } from "next/navigation";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import { getFormOptions } from "@/lib/form-options";
import { officeRoles,paymentStatus,type Obligation } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { nextBusinessDate } from "@/lib/reminders";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { BillDetails } from "@/components/bill-details";
import { EmptyState,ListRow,SectionHeading,Tabs } from "@/components/ui";
import { Feedback,Pagination,pageNumber } from "@/components/query-ui";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles,user}=await requireAccess(officeRoles);const q=await searchParams;const kind=q.tab==="hutang"?"payable":"receivable";const today=businessToday();const period=resolvePeriod({...q,period:q.period??"all"});const page=pageNumber(q);
 if(q.status==="due_soon"){const next=new URLSearchParams(Object.entries(q).filter((entry):entry is [string,string]=>typeof entry[1]==="string"));next.set("status","open");next.delete("page");redirect(`/tagihan?${next}`);}
 const reminder=["today","tomorrow","overdue","unscheduled"].includes(q.status??"");
 let request=db.from("obligations").select("*").eq("kind",kind);
 request=reminder?request.order("due_date",{ascending:true,nullsFirst:false}).order("document_date").order("source_id"):request.order("document_date",{ascending:false}).order("source_id");
 if(period.start)request=request.gte("document_date",period.start);if(period.end)request=request.lte("document_date",period.end);
 if(q.q)request=request.ilike("partner_name",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 if(q.status==="paid")request=request.eq("balance_amount",0);
 else if(q.status==="open"||reminder)request=request.gt("balance_amount",0);
 if(q.status==="overdue")request=request.lt("due_date",today);
 if(q.status==="today")request=request.eq("due_date",today);
 if(q.status==="tomorrow")request=request.eq("due_date",nextBusinessDate(today));
 if(q.status==="unscheduled")request=request.is("due_date",null);
 const [result,options]=await Promise.all([request.range((page-1)*30,page*30),getFormOptions(db,user.id,true,false)]);const bills=(result.data??[]) as Obligation[];
 const tab=kind==="payable"?"hutang":"piutang";const params=new URLSearchParams(Object.entries({...q,tab}).filter((entry):entry is [string,string]=>typeof entry[1]==="string"&&!['error','ok','r'].includes(entry[0])));const path=`/tagihan?${params}`;
 return <AppShell title="Piutang & hutang" active="finance" role={role} roles={roles}>
  <Feedback query={q} error={!!result.error||options.error}/>
  <Tabs active={tab} items={[{id:"piutang",label:"Piutang pelanggan",href:"/tagihan?tab=piutang"},{id:"hutang",label:"Hutang supplier",href:"/tagihan?tab=hutang"}]}/>
  <PeriodFilter compact period={period} today={today} search filters={[{name:"status",label:"Pembayaran",options:[{value:"",label:"Semua"},{value:"open",label:"Belum lunas"},{value:"paid",label:"Lunas"},{value:"today",label:"Hari ini"},{value:"tomorrow",label:"Besok"},{value:"overdue",label:"Terlambat"},{value:"unscheduled",label:"Belum dijadwalkan"}]}]}/>
  <SectionHeading title={kind==="payable"?"Tagihan supplier":"Tagihan pelanggan"}/>
  <div className="list-card">{bills.slice(0,30).map(b=><Sheet key={b.source_id} title={b.reference} className="row-button" trigger={<ListRow title={b.partner_name} subtitle={`${b.reference} \u00b7 ${b.due_date?"Tempo "+formatDate(b.due_date):"Belum dijadwalkan"} \u00b7 ${paymentStatus(b,today)}`} trailing={<strong>Sisa Rp{formatDecimal(b.balance)}</strong>}/>}>
    <BillDetails bill={b} today={today} accounts={options.accounts} returnTo={path} accountsError={options.error}/>
  </Sheet>)}{!result.error&&!bills.length&&<EmptyState title="Tidak ada tagihan sesuai filter" icon="file"/>}</div>
  <Pagination query={q} path="/tagihan" hasNext={bills.length>30}/>
 </AppShell>;
}
