import Link from "next/link";
import {AnalysisDetails} from "@/components/analysis-details";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";
import { businessToday,resolvePeriod,type Query } from "@/lib/period";
import type { Summary } from "@/lib/summary";
import { formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { EmptyState,ListRow,Notice,SectionHeading } from "@/components/ui";
export default async function Page({searchParams}:{searchParams:Promise<Query>}){
 const {db,role,roles}=await requireAccess(officeRoles);const q=await searchParams;const period=resolvePeriod(q,businessToday(),true);const {data,error}=await db.rpc("business_summary",{p_start:period.start,p_end:period.end});const s=data as Summary|null;
 const rules=s?[{show:Number(s.collector)>0,title:"Uang masih di penagih",body:`Rp${formatDecimal(s.collector)} masih tercatat di kas penagih. Tinjau setoran dan jadwal penyerahan uang.`,href:"/setoran?period=all"},{show:s.attention.overdue>0,title:"Tagihan lewat jatuh tempo",body:`${formatDecimal(s.attention.overdue)} dokumen belum lunas dan melewati tanggal jatuh tempo. Tinjau daftar piutang dan hutang.`,href:"/tagihan?status=overdue"},{show:Number(s.purchases)>Number(s.net_sales),title:"Pembelian melebihi penjualan periode",body:`Pembelian Rp${formatDecimal(s.purchases)}, penjualan bersih Rp${formatDecimal(s.net_sales)}. Tinjau persediaan dan kebutuhan kas; perbandingan ini belum menunjukkan laba/rugi.`,href:"/stok"},{show:s.attention.weight_discrepancies>0,title:"Selisih timbang perlu ditinjau",body:`${formatDecimal(s.attention.weight_discrepancies)} penerimaan memiliki selisih yang belum diberi catatan peninjauan. Selisih dapat berasal dari susut, tara, atau alat timbang.`,href:"/pembelian?period=all"},{show:Number(s.cash)-Number(s.collector)<Number(s.payable),title:"Tinjau kecukupan kas untuk hutang",body:`Kas kantor/bank saat ini Rp${formatDecimal((Number(s.cash)-Number(s.collector)).toFixed(2))}, total hutang Rp${formatDecimal(s.payable)}. Pertimbangkan jadwal tagihan dan penagihan pelanggan.`,href:"/tagihan?tab=hutang"}]:[];
 return <AppShell title="Analisis usaha" active="more" role={role} roles={roles}><PeriodFilter compact period={period} today={businessToday()}/>{error&&<Notice error>Analisis tidak dapat dimuat.</Notice>}<Notice>Indikasi berdasarkan transaksi tercatat. Laba bersih belum tersedia sampai HPP dan data akuntansi lengkap.</Notice><SectionHeading title="Perhatian berdasarkan data"/><div className="list-card">{rules.filter(r=>r.show).map(r=><Link key={r.title} href={r.href}><ListRow title={r.title} subtitle={r.body}/></Link>)}{s&&!rules.some(r=>r.show)&&<EmptyState title="Tidak ada perhatian saat ini"/>}</div>{s&&<AnalysisDetails summary={s}/>}</AppShell>;
}
