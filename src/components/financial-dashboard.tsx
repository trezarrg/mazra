import Link from "next/link";
import { formatDate, formatDecimal } from "@/lib/format";
import { cents, fromCents } from "@/lib/money";
import type { Period } from "@/lib/period";
import type { Summary } from "@/lib/summary";
import type { Reminders } from "@/lib/reminders";
import type { Option } from "@/lib/operations";
import { AnimatedNumber } from "./animated-number";
import { PeriodFilter } from "./period-filter";
import { CashFlowChart } from "./cash-flow-chart";
import { DashboardReminders } from "./dashboard-reminders";
import { ProfitBreakdown } from "./profit-breakdown";

function Money({value}:{value:string|null}) {
  return value===null ? <span className="cost-incomplete">Belum lengkap</span> : <><span className="currency">Rp</span> <AnimatedNumber value={value}/></>;
}
export function FinancialDashboard({summary:s,reminders,accounts,period,today,trend,months,remindersError=false,accountsError=false,chartError=false}:{summary:Summary|null;reminders:Reminders|null;accounts:Option[];period:Period;today:string;trend:Summary|null;months:string[];remindersError?:boolean;accountsError?:boolean;chartError?:boolean}) {
  const params=new URLSearchParams({period:period.mode,date:period.date,month:period.month,start:period.start??"",end:period.end??""}).toString();
  const returnTo=`/?${params}`;
  const label=period.start&&period.end ? period.start===period.end?formatDate(period.start):`${formatDate(period.start)} – ${formatDate(period.end)}` : "Semua periode";
  const change=s?.previous_sales!==null && s?.previous_sales!==undefined ? cents(s.net_sales)-cents(s.previous_sales):null;
  const negative=(value:string|null)=>value!==null && cents(value)<BigInt(0)?" amount-negative":"";
  return <>
    <div className="financial-position" aria-label="Posisi keuangan saat ini">
      {([['Piutang pelanggan',s?.receivable??null,'/tagihan?tab=piutang&status=open'],['Hutang supplier',s?.payable??null,'/tagihan?tab=hutang&status=open'],['Kas & bank',s?.cash??null,'/akuntansi']] as const).map(([title,value,href],index)=><Link key={title} href={href} className={`kpi-card position-card${index===2?" position-cash":""}`}><div className="kpi-label"><h3>{title}</h3><span>Saat ini</span></div><strong className="kpi-amount">{s?<Money value={value}/>:<span className="cost-incomplete">Belum tersedia</span>}</strong><div className="kpi-footer">{index===2?"Rincian saldo":"Sisa seluruh invoice belum lunas"}</div></Link>)}
    </div>
    <DashboardReminders data={reminders} accounts={accounts} returnTo={returnTo} error={remindersError} accountsError={accountsError}/>
    <div className="dashboard-period"><div><h2>Kinerja usaha</h2><p>{label}</p></div><PeriodFilter period={period} today={today}/></div>
    {s ? <>
      <div className="performance-kpis">
        <Link href={`/riwayat?${params}`} className="kpi-card"><div className="kpi-label"><h3>Omzet bersih</h3></div><strong className="kpi-amount"><Money value={s.net_sales}/></strong><div className="kpi-footer">{change===null?"Termasuk penjualan tempo":change===BigInt(0)?"Sama dengan periode sebelumnya":`${change>BigInt(0)?"Naik":"Turun"} Rp${formatDecimal(fromCents(change<0?-change:change))}`}</div></Link>
        <Link href={`/riwayat?tab=pembelian&${params}`} className="kpi-card"><div className="kpi-label"><h3>Pembelian bersih</h3></div><strong className="kpi-amount"><Money value={s.net_purchases}/></strong><div className="kpi-footer">Penerimaan dikurangi retur</div></Link>
        <Link href={`/akuntansi?tab=laba&${params}`} className="kpi-card"><div className="kpi-label"><h3>Laba kotor</h3></div><strong className={`kpi-amount${negative(s.gross_profit)}`}><Money value={s.gross_profit}/></strong><div className="kpi-footer">HPP {s.cogs===null?"belum lengkap":`Rp${formatDecimal(s.cogs)}`}</div></Link>
        <Link href={`/akuntansi?tab=laba&${params}`} className="kpi-card profit-card"><div className="kpi-label"><h3>Profit usaha</h3></div><strong className={`kpi-amount${negative(s.business_profit)}`}><Money value={s.business_profit}/></strong><div className="kpi-footer">Sebelum pajak & penyusutan</div></Link>
      </div>
      {!s.profit_complete && <p className="dashboard-note">Sebagian modal belum lengkap. <Link href="/akuntansi?tab=modal" className="text-link">Periksa modal stok</Link></p>}
      <details className="dashboard-profit-details"><summary>Rincian perhitungan <span>Omzet, HPP, biaya, dan profit</span></summary><ProfitBreakdown summary={s}/></details>
    </> : <p className="notice is-error">Kinerja usaha belum dapat dimuat.</p>}
    <div className="dashboard-middle">
      <CashFlowChart rows={trend?.cash_trend??[]} months={months} error={chartError||!trend}/>
      <section className="dashboard-panel inventory-snapshot"><div className="panel-heading"><div><h2>Stok tersedia</h2><p>Posisi saat ini</p></div><Link href="/stok" className="text-link">Lihat stok</Link></div>
        {s?<><div className="stock-units">{s.stock.length?s.stock.map(row=><span key={row.unit}><strong>{formatDecimal(row.quantity)}</strong> {row.unit}</span>):<p>Belum ada stok tercatat</p>}</div><div className="inventory-value"><span>Nilai modal stok</span><strong><Money value={s.inventory_value}/></strong></div>{s.missing_inventory>0&&<Link href="/akuntansi?tab=modal" className="text-link inventory-review">Lengkapi modal stok</Link>}</>:<p className="panel-footnote">Stok belum dapat dimuat.</p>}
      </section>
    </div>
  </>;
}
