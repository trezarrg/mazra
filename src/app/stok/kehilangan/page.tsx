import Link from "next/link";
import {randomUUID} from "node:crypto";
import {requireAccess} from "@/lib/access";
import {officeRoles} from "@/lib/operations";
import {getFormOptions} from "@/lib/form-options";
import {businessToday,resolvePeriod,type Query} from "@/lib/period";
import {formatDate} from "@/lib/format";
import {AppShell} from "@/components/app-shell";
import {PeriodFilter} from "@/components/period-filter";
import {OperationForm} from "@/components/operation-form";
import {Sheet} from "@/components/sheet";
import {Feedback,Pagination,pageNumber} from "@/components/query-ui";
import {EmptyState,ListRow,SectionHeading} from "@/components/ui";

export default async function StockLosses({searchParams}:{searchParams:Promise<Query>}) {
  const {db,role,roles,user}=await requireAccess(officeRoles);
  const q=await searchParams,today=businessToday(),period=resolvePeriod(q),page=pageNumber(q);
  let request=db.from("operations").select("id,document_no,operation_date,status,note,payload,reversed_by").eq("kind","adjustment").contains("payload",{stock_event:"loss"}).order("operation_date",{ascending:false}).order("id");
  if(period.start)request=request.gte("operation_date",period.start);
  if(period.end)request=request.lte("operation_date",period.end);
  const [rows,options]=await Promise.all([request.range((page-1)*30,page*30),getFormOptions(db,user.id)]);
  return <AppShell title="Kehilangan stok" active="stock" role={role} roles={roles}>
    <Link className="text-link" href="/stok">Kembali ke stok</Link><Feedback query={q} error={!!rows.error||options.error}/><PeriodFilter compact period={period} today={today}/>
    <SectionHeading title="Catatan kehilangan" action={!options.error&&<Sheet title="Catat kehilangan stok" trigger="Tambah"><OperationForm id={randomUUID()} kind="adjustment" today={today} options={options} initial={{stock_event:"loss",loss_reason:"housing_death",location:"Kandang"}} returnTo="/stok/kehilangan"/></Sheet>}/>
    <div className="list-card">{rows.data?.slice(0,30).map(row=><Link key={row.id} href={`/dokumen/${row.id}`}><ListRow title={`Kehilangan #${row.document_no}`} subtitle={`${formatDate(row.operation_date)} · ${row.note??""}`} trailing={<span className="badge">{row.reversed_by?"Dibatalkan":row.status==="draft"?"Draft":"Tercatat"}</span>}/></Link>)}{!rows.error&&!rows.data?.length&&<EmptyState title="Belum ada kehilangan pada periode ini"/>}</div><Pagination query={q} path="/stok/kehilangan" hasNext={(rows.data?.length??0)>30}/>
  </AppShell>;
}
