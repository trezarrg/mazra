import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { officeRoles,kindLabels } from "@/lib/operations";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { OperationForm } from "@/components/operation-form";
import { EmptyState,ListRow,SectionHeading,Tabs } from "@/components/ui";
import { Feedback,Pagination,pageNumber } from "@/components/query-ui";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles,user}=await requireAccess([...officeRoles,"production"]);const q=await searchParams;const history=q.tab==="riwayat";const today=businessToday();const period=resolvePeriod(q);const page=pageNumber(q);const owner=roles.some(r=>["developer","owner"].includes(r));
 let balanceRequest=db.from("stock_balances").select("*").order("product_name").order("product_id").order("unit");if(q.q)balanceRequest=balanceRequest.ilike("product_name",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 let historyRequest=db.from("stock_history").select("*").order("created_at",{ascending:false}).order("id");if(period.start)historyRequest=historyRequest.gte("movement_date",period.start);if(period.end)historyRequest=historyRequest.lte("movement_date",period.end);if(q.q)historyRequest=historyRequest.ilike("product_name",`%${q.q.replace(/[%_]/g,"").slice(0,100)}%`);
 const [balances,movements,options]=await Promise.all([!history?balanceRequest.range((page-1)*40,page*40):Promise.resolve({data:[],error:null}),history?historyRequest.range((page-1)*40,page*40):Promise.resolve({data:[],error:null}),owner?getFormOptions(db,user.id):Promise.resolve(null)]);
 const list=history?movements.data:balances.data;
 return <AppShell title="Produk & stok" active="stock" role={role} roles={roles}><Feedback query={q} error={!!balances.error||!!movements.error||!!options?.error}/><div className="toolbar"><Link className="button button-primary" href="/produksi">Catat hasil potong</Link>{owner&&options&&<Sheet title="Penyesuaian stok beralasan" className="button button-secondary" trigger="Penyesuaian"><OperationForm id={randomUUID()} kind="adjustment" today={today} options={options} returnTo="/stok"/></Sheet>}</div><Tabs active={history?"riwayat":"stok"} items={[{id:"stok",label:"Stok tersedia",href:"/stok"},{id:"riwayat",label:"Riwayat gerakan",href:"/stok?tab=riwayat"}]}/>{history&&<PeriodFilter compact period={period} today={today} search/>}<SectionHeading title={history?"Pergerakan stok":"Persediaan saat ini"}/><div className="list-card">{history?movements.data?.slice(0,40).map(s=><div key={s.id}><ListRow title={`${s.product_name}${s.variant_name?` · ${s.variant_name}`:""}`} subtitle={`${formatDate(s.movement_date)} · ${kindLabels[s.source_type]??"Gerakan stok"}`} icon="clock" trailing={<strong className={Number(s.quantity)<0?"amount-negative":"amount-positive"}>{Number(s.quantity)>0?"+":""}{formatDecimal(s.quantity)} {s.unit}</strong>}/></div>):balances.data?.slice(0,40).map(s=><div key={`${s.product_id}-${s.variant_id}-${s.unit}`}><ListRow title={s.product_name} subtitle={s.variant_name||"Tanpa varian"} trailing={<strong className={Number(s.balance)<0?"amount-negative":""}>{formatDecimal(s.balance)} {s.unit}</strong>}/></div>)}{!balances.error&&!movements.error&&!list?.length&&<EmptyState title={history?"Belum ada gerakan pada periode ini":"Stok belum tercatat"}/>}</div><Pagination query={q} path="/stok" hasNext={(list?.length??0)>40}/></AppShell>;
}
