import {randomUUID} from "node:crypto";
import {requireAccess} from "@/lib/access";
import {businessToday,resolvePeriod,type Query} from "@/lib/period";
import {officeRoles} from "@/lib/operations";
import {formatDate,formatDecimal} from "@/lib/format";
import {AppShell} from "@/components/app-shell";
import {PeriodFilter} from "@/components/period-filter";
import {Sheet} from "@/components/sheet";
import {SubmitButton} from "@/components/submit-button";
import {Feedback,Pagination,pageNumber} from "@/components/query-ui";
import {EmptyState,SectionHeading} from "@/components/ui";
import {cancelMeasurement} from "@/app/operasi/actions";
import {MeasurementForm} from "./forms";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles,user}=await requireAccess([...officeRoles,"production"]);const q=await searchParams;const today=businessToday();const period=resolvePeriod(q);const page=pageNumber(q);const office=roles.some(r=>officeRoles.includes(r));
 let request=db.from("receipt_measurements").select("*").order("created_at",{ascending:false});if(period.start)request=request.gte("measurement_date",period.start);if(period.end)request=request.lte("measurement_date",period.end);
 const [tasks,result]=await Promise.all([db.rpc("receiving_tasks"),request.range((page-1)*30,page*30)]);const orders=(tasks.data??[]) as {id:string;document_no:number;product_name:string;origin:string|null}[];const list=result.data??[];
 return <AppShell title="Timbang penerimaan" active="more" role={role} roles={roles}><Feedback query={q} error={!!tasks.error||!!result.error}/><PeriodFilter period={period} today={today}/><SectionHeading title="Hasil timbang" action={<Sheet title="Catat netto aktual" trigger="Catat"><MeasurementForm id={randomUUID()} today={today} orders={orders.map(o=>({value:o.id,label:`DO #${o.document_no} · ${o.product_name}${o.origin?` · ${o.origin}`:""}`}))}/></Sheet>}/><div className="transaction-grid">{list.slice(0,30).map(m=><article className="transaction-card" key={m.id}><div><strong>{formatDecimal(m.actual_weight)} kg</strong><span className="badge">{m.status==="accepted"?"Dikonfirmasi":m.status==="cancelled"?"Dibatalkan":"Menunggu konfirmasi"}</span></div><p>{formatDate(m.measurement_date)} · DO {orders.find(o=>o.id===m.do_id)?.document_no??m.do_id.slice(0,8)}</p>{m.origin_weight&&<p>Asal {formatDecimal(m.origin_weight)} kg · Selisih {formatDecimal((Number(m.actual_weight)-Number(m.origin_weight)).toFixed(3))} kg</p>}{m.note&&<p>{m.note}</p>}{m.status==="pending"&&(office||m.created_by===user.id)&&<details className="form-details"><summary>Batalkan hasil timbang</summary><form action={cancelMeasurement} className="form"><input type="hidden" name="id" value={m.id}/><input type="hidden" name="return_to" value="/penerimaan"/><label>Alasan<textarea name="note" required maxLength={1000}/></label><SubmitButton secondary>Batalkan</SubmitButton></form></details>}</article>)}</div>{!result.error&&!list.length&&<EmptyState title="Belum ada hasil timbang pada periode ini"/>}<Pagination query={q} path="/penerimaan" hasNext={list.length>30}/></AppShell>;
}
