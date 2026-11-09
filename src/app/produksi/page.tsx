import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDate, formatDecimal } from "@/lib/format";
import { getProcessingOptions, type ProcessingSummary } from "@/lib/processing";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { ProcessingForm } from "@/components/processing-form";
import { EmptyState, ListRow, SectionHeading } from "@/components/ui";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const { db, role, roles } = await requireAccess([...officeRoles, "production"]);
  const q = await searchParams, today = businessToday(), page = pageNumber(q);
  const period = resolvePeriod(q);
  const search = q.q?.replace(/[%_]/g, "").slice(0, 100);
  let processRequest = db.from("processing_list").select("*").in("status", ["draft", "final", "cancelled"]).order("operation_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if(q.status==="cancelled")processRequest=processRequest.or("reversed_by.not.is.null,status.eq.cancelled");else processRequest=processRequest.is("reversed_by",null).neq("status","cancelled");
  if (period.start) processRequest = processRequest.gte("operation_date", period.start);
  if (period.end) processRequest = processRequest.lte("operation_date", period.end);
  if (["draft", "final"].includes(q.status ?? "")) processRequest = processRequest.eq("status", q.status!);
  if (search) processRequest = processRequest.ilike("search_text", `%${search}%`);
  const [processes, options, report] = await Promise.all([
    processRequest.range((page - 1) * 40, page * 40),
    getProcessingOptions(db),
    db.rpc("processing_summary", { p_start: period.start, p_end: period.end }),
  ]);
  const summary = report.data as ProcessingSummary | null;
  const input = Number(summary?.input_weight ?? 0), output = Number(summary?.output_weight ?? 0);
  const returnTo = "/produksi";
  return <AppShell title="Hasil potong" active="stock" role={role} roles={roles}>
    <Feedback query={q} error={!!processes.error || options.error || !!report.error}/>
    <PeriodFilter compact period={period} today={today} search filters={[{ name: "status", label: "Status", options: [{ value: "", label: "Semua status" }, { value: "draft", label: "Draft" }, { value: "final", label: "Selesai" },{value:"cancelled",label:"Dibatalkan"}] }]}/>
    <SectionHeading title="Catatan" action={!options.error && <Sheet title="Catat hasil potong" trigger="Tambah"><ProcessingForm id={randomUUID()} today={today} choices={options.choices} returnTo={returnTo}/></Sheet>}/>
    <div className="list-card">
      {processes.data?.slice(0, 40).map(process => <Link key={process.id} href={`/dokumen/${process.id}`}><ListRow title={`${process.input_name ?? "Hasil potong"} · #${process.document_no}`} subtitle={`${formatDate(process.operation_date)} · ${process.reversed_by||process.status==="cancelled"?"Dibatalkan":process.status === "draft" ? "Draft" : "Selesai"}${process.piece_count ? ` · ${formatDecimal(process.piece_count)} ekor/pcs` : ""}`} trailing={<span className="processing-row-weights"><strong>{formatDecimal(process.input_weight)} kg diolah</strong><small>{formatDecimal(process.output_weight)} kg hasil</small></span>}/></Link>)}
      {!processes.error && !processes.data?.length && <EmptyState title="Belum ada hasil potong pada filter ini"/>}
    </div>
    <Pagination query={q} path="/produksi" hasNext={(processes.data?.length ?? 0) > 40}/>
    {summary && <details className="form-details">
      <summary>Ringkasan periode</summary>
      <p className="caption">Seluruh transaksi selesai pada periode terpilih. Draft dan transaksi yang dibatalkan tidak dihitung.</p>
      <div className="calculation">{formatDecimal(summary.process_count)} proses{summary.piece_count ? ` · ${summary.count_status==="estimated"?"± ":""}${formatDecimal(summary.piece_count)} ${summary.count_unit??"ekor/pcs"}${summary.count_status==="incomplete"?" (sebagian tercatat)":" tercatat"}` : ""}<br/>Diolah {formatDecimal(summary.input_weight)} kg · Hasil {formatDecimal(summary.output_weight)} kg<br/>Selisih proses {formatDecimal((input - output).toFixed(3))} kg · Perolehan {formatDecimal((input > 0 ? output / input * 100 : 0).toFixed(2))}%</div>
      {!!summary.outputs.length && <div className="list-card">{summary.outputs.map(item => <div key={`${item.product_id}:${item.variant_id ?? ""}`}><ListRow title={item.name} subtitle={item.piece_count ? `${item.count_status==="estimated"?"± ":""}${formatDecimal(item.piece_count)} ${item.count_unit??"ekor/pcs"}${item.count_status==="incomplete"?" (sebagian tercatat)":" tercatat"}` : undefined} trailing={<strong>{formatDecimal(item.weight)} kg</strong>}/></div>)}</div>}
      {summary.purchases !== undefined && summary.sales !== undefined && <div className="list-card"><div><ListRow title="Pembelian tercatat" trailing={<strong>Rp{formatDecimal(summary.purchases)}</strong>}/></div><div><ListRow title="Penjualan tercatat" trailing={<strong>Rp{formatDecimal(summary.sales)}</strong>}/></div></div>}
    </details>}
  </AppShell>;
}
