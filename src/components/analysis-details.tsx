import {formatDate,formatDecimal} from "@/lib/format";
import Link from "next/link";
import {cents,fromCents} from "@/lib/money";
import type {Summary} from "@/lib/summary";
import {EmptyState,ListRow,SectionHeading} from "./ui";
import {Sheet} from "./sheet";

export function AnalysisDetails({summary:s}:{summary:Summary}){
 const office=s.cash;
 return <>
  <SectionHeading title="Perbandingan periode & kebutuhan kas"/>
  <div className="list-card">
   {s.previous_sales!==null&&s.previous_start&&s.previous_end&&<Sheet title="Penjualan bersih antarperiode" className="row-button" trigger={<ListRow title="Penjualan bersih antarperiode" subtitle={`${formatDate(s.previous_start)} – ${formatDate(s.previous_end)} dibandingkan periode terpilih`} trailing={<strong>Rp{formatDecimal(s.net_sales)}</strong>}/>}><div className="document-summary"><p>Periode terpilih Rp{formatDecimal(s.net_sales)}</p><p>{formatDate(s.previous_start)} – {formatDate(s.previous_end)}: Rp{formatDecimal(s.previous_sales)}</p><strong>Perubahan Rp{formatDecimal(fromCents(cents(s.net_sales)-cents(s.previous_sales)))}</strong></div></Sheet>}
   <Link className="row-button" href="/tagihan?tab=hutang&status=today&period=all"><ListRow title="Pembayaran supplier hari ini" subtitle={`Kas & bank saat ini Rp${formatDecimal(office)}`} trailing={<span className="text-link">Lihat tagihan</span>}/></Link>
   <Link className="row-button" href="/tagihan?tab=hutang&status=tomorrow&period=all"><ListRow title="Pembayaran supplier besok" trailing={<span className="text-link">Lihat tagihan</span>}/></Link>
  </div>
  <SectionHeading title="Arus kas bersih per bulan"/>
  <div className="list-card">{s.cash_trend.map(t=><div key={t.month}><ListRow title={new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${t.month}-01T00:00:00Z`))} subtitle={`Masuk Rp${formatDecimal(t.incoming)} · Keluar Rp${formatDecimal(t.outgoing)}`} trailing={<strong>Rp{formatDecimal(t.net)}</strong>}/></div>)}{!s.cash_trend.length&&<EmptyState title="Belum ada pergerakan kas pada periode ini"/>}</div>
 </>;
}
