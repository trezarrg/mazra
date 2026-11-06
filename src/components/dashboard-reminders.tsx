import Link from "next/link";
import { formatDate, formatDecimal } from "@/lib/format";
import { reminderLabels, reminderPath, type Reminders } from "@/lib/reminders";
import type { Option } from "@/lib/operations";
import { Sheet } from "./sheet";
import { BillDetails } from "./bill-details";

export function DashboardReminders({data,accounts,returnTo="/",error=false,accountsError=false}:{data:Reminders|null;accounts:Option[];returnTo?:string;error?:boolean;accountsError?:boolean}) {
  return <div className="payment-reminders">{(["receivable","payable"] as const).map(kind => <section className="dashboard-panel reminder-panel" data-kind={kind} key={kind} aria-label={kind==="receivable"?"Harus ditagih":"Harus dibayar"}>
    <div className="panel-heading"><div><h2>{kind==="receivable"?"Harus ditagih":"Harus dibayar"}</h2><p>{kind==="receivable"?"Piutang pelanggan":"Hutang supplier"} · seluruh periode</p></div><Link className="text-link" href={reminderPath(kind,"open")}>Semua</Link></div>
    {error || !data ? <p className="panel-footnote" role="status">Pengingat belum dapat dimuat. Silakan muat ulang.</p> : <>
      {(["overdue","today","tomorrow"] as const).map(bucket => {
        const group=data[kind][bucket];
        if(bucket==="overdue" && !group.count) return null;
        return <div key={bucket} className={`reminder-group reminder-${bucket}`}>
          <div className="reminder-group-heading"><h3>{reminderLabels[bucket]} <span>{group.count} invoice</span></h3><strong>Rp{formatDecimal(group.total)}</strong></div>
          {group.items.length ? <div className="reminder-items">{group.items.map(bill => <Sheet key={bill.source_id} title={bill.reference} className="reminder-row" trigger={<><span><b>{bill.partner_name}</b><small>{bill.reference} · {bill.due_date && formatDate(bill.due_date)}</small></span><strong>Rp{formatDecimal(bill.balance)}</strong></>}><BillDetails bill={bill} today={data.today} accounts={accounts} returnTo={returnTo} accountsError={accountsError}/></Sheet>)}</div> : <p className="reminder-empty">Tidak ada {kind==="receivable"?"tagihan pelanggan":"pembayaran supplier"} {bucket==="today"?"hari ini":"besok"}.</p>}
          {group.count>5 && <Link className="reminder-more text-link" href={reminderPath(kind,bucket)}>Lihat semua {group.count} invoice</Link>}
        </div>;
      })}
      {data[kind].unscheduled.count>0 && <Link className="reminder-unscheduled" href={reminderPath(kind,"unscheduled")}><span><b>Belum dijadwalkan</b><small>{data[kind].unscheduled.count} invoice · Atur jatuh tempo</small></span><strong>Rp{formatDecimal(data[kind].unscheduled.total)}</strong></Link>}
    </>}
  </section>)}</div>;
}
