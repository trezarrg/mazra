import Link from "next/link";
import { requireAccess } from "@/lib/access";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { officeRoles } from "@/lib/operations";
import { formatDate, formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { SubmitButton } from "@/components/submit-button";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";
import { EmptyState, ListRow, Notice } from "@/components/ui";
import { cancelMeasurement } from "@/app/operasi/actions";
import { ReceivingQueue, type ReceivingTask } from "./queue-list";

type History = { id: string; do_id: string; document_no: number; supplier_name: string; product_name: string; measurement_date: string; origin_weight: string | null; actual_weight: string; note: string | null; status: string; created_by: string };

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const { db, role, roles, user } = await requireAccess([...officeRoles, "production"]);
  const q = await searchParams, today = businessToday(), completed = q.status === "done", office = roles.some(r => officeRoles.includes(r));
  const period = resolvePeriod(q), page = pageNumber(q);
  let request = completed
    ? db.rpc("receiving_history_measured").neq("status", "cancelled").order("measurement_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
    : db.rpc("receiving_queue_measured").order("purchase_date", { ascending: false }).order("document_no", { ascending: false }).order("id");
  const dateColumn = completed ? "measurement_date" : "purchase_date";
  if (period.start) request = request.gte(dateColumn, period.start);
  if (period.end) request = request.lte(dateColumn, period.end);
  const result = await request.range((page - 1) * 30, page * 30);
  const tasks = completed ? [] : (result.data ?? []) as ReceivingTask[];
  const records = completed ? (result.data ?? []) as History[] : [];
  return <AppShell title="Timbang penerimaan" active="more" role={role} roles={roles}>
    <Feedback query={completed ? q : { ...q, ok: undefined }} error={!!result.error}/>
    {!completed && q.ok && <Notice>Hasil timbang dikirim ke Pembelian dan menunggu konfirmasi.</Notice>}
    <PeriodFilter compact period={period} today={today} filters={[{ name: "status", label: "Status timbang", options: [{ value: "", label: "Belum" }, { value: "done", label: "Sudah" }] }]}/>
    <div className="list-card">
      {!completed && <ReceivingQueue tasks={tasks.slice(0, 30)} today={today} error={!!result.error}/>}
      {completed && records.slice(0, 30).map(record => {
        const status = record.status === "accepted" ? "Diterima lewat timbang" : record.status === "received" ? "Diterima di Pembelian" : record.status === "cancelled" ? "Timbang dibatalkan" : "Menunggu konfirmasi";
        return <Sheet key={`${record.status}-${record.id}`} title={`DO #${record.document_no}`} className="row-button" trigger={<ListRow title={`${record.supplier_name} · DO #${record.document_no}`} subtitle={`${formatDate(record.measurement_date)} · ${status}`} trailing={<strong>{formatDecimal(record.actual_weight)} kg</strong>}/>}>
          <div className="document-summary"><strong>{record.product_name} · {formatDecimal(record.actual_weight)} kg</strong><span className={`badge ${record.status === "accepted" || record.status === "received" ? "badge-green" : record.status === "pending" ? "badge-amber" : ""}`}>{status}</span><p>{formatDate(record.measurement_date)}</p>{record.origin_weight && <p>Berat asal {formatDecimal(record.origin_weight)} kg · Selisih {formatDecimal((Number(record.actual_weight) - Number(record.origin_weight)).toFixed(3))} kg</p>}{record.note && <p>{record.note}</p>}</div>
          {record.status === "pending" && office && <Link className="button button-primary" href={`/pembelian?do=${record.do_id}&period=all`}>Konfirmasi di Pembelian</Link>}
          {record.status === "pending" && (office || record.created_by === user.id) && <details className="form-details"><summary>Batalkan hasil timbang</summary><form action={cancelMeasurement} className="form"><input type="hidden" name="id" value={record.id}/><input type="hidden" name="return_to" value="/penerimaan?status=done&period=all"/><label>Alasan<textarea name="note" required maxLength={1000}/></label><SubmitButton secondary>Batalkan hasil timbang</SubmitButton></form></details>}
        </Sheet>;
      })}
      {completed && !result.error && !records.length && <EmptyState title="Belum ada penerimaan yang sudah ditimbang pada periode ini"/>}
    </div>
    <Pagination query={q} path="/penerimaan" hasNext={(result.data?.length ?? 0) > 30}/>
  </AppShell>;
}
