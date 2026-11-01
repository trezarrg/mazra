import {formatDate,formatDecimal} from "@/lib/format";
import {cents,fromCents} from "@/lib/money";
import type {Summary} from "@/lib/summary";
import {EmptyState,ListRow,SectionHeading} from "./ui";
import {Sheet} from "./sheet";

export function AnalysisDetails({summary:s}:{summary:Summary}){
 const office=fromCents(cents(s.cash)-cents(s.collector));
 return <>
  <SectionHeading title="Perbandingan periode & kebutuhan kas"/>
  <div className="list-card">
   {s.previous_sales!==null&&s.previous_start&&s.previous_end&&<Sheet title="Penjualan bersih antarperiode" className="row-button" trigger={<ListRow title="Penjualan bersih antarperiode" subtitle={`${formatDate(s.previous_start)} – ${formatDate(s.previous_end)} dibandingkan periode terpilih`} trailing={<strong>Rp{formatDecimal(s.net_sales)}</strong>}/>}><div className="document-summary"><p>Periode terpilih Rp{formatDecimal(s.net_sales)}</p><p>{formatDate(s.previous_start)} – {formatDate(s.previous_end)}: Rp{formatDecimal(s.previous_sales)}</p><strong>Perubahan Rp{formatDecimal(fromCents(cents(s.net_sales)-cents(s.previous_sales)))}</strong></div></Sheet>}
   <Sheet title="Hutang jatuh tempo 7 hari" className="row-button" trigger={<ListRow title="Hutang jatuh tempo 7 hari" subtitle={`Kas kantor / bank saat ini Rp${formatDecimal(office)}`} trailing={<strong>Rp{formatDecimal(s.due_next7)}</strong>}/>}><div className="document-summary"><p>Tagihan jatuh tempo mulai hari ini: Rp{formatDecimal(s.due_next7)}</p><p>Kas kantor / bank saat ini: Rp{formatDecimal(office)}</p><p>{cents(office)<cents(s.due_next7)?"Tinjau jadwal pembayaran dan penerimaan sebelum jatuh tempo.":"Kas tercatat mencukupi nominal jatuh tempo ini; tetap pertimbangkan kebutuhan operasional lain."}</p></div></Sheet>
  </div>
  <SectionHeading title="Arus kas bersih per bulan"/>
  <div className="list-card">{s.cash_trend.map(t=><div key={t.month}><ListRow title={new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${t.month}-01T00:00:00Z`))} subtitle={`Masuk Rp${formatDecimal(t.incoming)} · Keluar Rp${formatDecimal(t.outgoing)}`} trailing={<strong>Rp{formatDecimal(t.net)}</strong>}/></div>)}{!s.cash_trend.length&&<EmptyState title="Belum ada pergerakan kas pada periode ini"/>}</div>
 </>;
}
