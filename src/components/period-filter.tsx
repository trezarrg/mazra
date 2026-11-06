"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "./dropdown";
import { DatePicker } from "./date-picker";
import { Icon } from "./icon";
import { isDate, type Period } from "@/lib/period";
import type { Option } from "@/lib/operations";

const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
type PeriodFilterProps = { period: Period; today: string; search?: boolean; compact?: boolean; showPeriod?: boolean; filters?: { name: string; label: string; options: Option[] }[] };
export function PeriodFilter(props: PeriodFilterProps) {
  const p=props.period;return <PeriodControls key={`${p.mode}-${p.date}-${p.month}-${p.start}-${p.end}`} {...props}/>;
}
function PeriodControls({ period, today, search = false, compact = false, showPeriod = true, filters = [] }: PeriodFilterProps) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams(); const [pending, transition] = useTransition();
  const latest = useRef(params.toString());
  useEffect(() => { latest.current = params.toString(); }, [params]);
  const [mode, setMode] = useState(period.mode); const [start, setStart] = useState(period.start || today); const [end, setEnd] = useState(period.end || today);
  const [error, setError] = useState(""); const [query, setQuery] = useState(params.get("q") ?? ""); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(latest.current);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    next.delete("page"); next.delete("ok"); next.delete("error"); latest.current = next.toString();
    transition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  function range(a: string, b: string) {
    setStart(a); setEnd(b);
    if (!isDate(a) || !isDate(b) || a > b) { setError("Tanggal awal harus sebelum atau sama dengan tanggal akhir. Periode terakhir tetap digunakan."); return; }
    setError(""); update({ period: "range", start: a, end: b });
  }
  const [year, month] = period.month.split("-");
  return <div className={`filter-panel${compact ? " filter-panel-compact" : ""}`} aria-busy={pending}>
    <div className="filter-grid">{showPeriod && <><Dropdown label="Periode" name="period" defaultValue={mode} options={[{value:"date",label:"Tanggal"},{value:"month",label:"Bulan"},{value:"range",label:"Rentang"},{value:"all",label:"Semua"}]} onValueChange={value => { setMode(value); setError(""); if(value === "range") range(start,end); else update({period:value,date:period.date,month:period.month}); }}/>
    {mode === "date" && <DatePicker key={period.date} label="Tanggal" name="date" today={today} defaultValue={period.date} onValueChange={value => update({period:"date",date:value})}/>}
    {mode === "month" && <><Dropdown key={month} label="Bulan" name="month_number" defaultValue={month} options={monthNames.map((label,i) => ({label,value:String(i+1).padStart(2,"0")}))} onValueChange={m => update({period:"month",month:`${year}-${m}`})}/><Dropdown key={year} label="Tahun" name="year" defaultValue={year} options={Array.from({length:51},(_,i)=>({value:String(Number(today.slice(0,4))-25+i),label:String(Number(today.slice(0,4))-25+i)}))} onValueChange={y => update({period:"month",month:`${y}-${month}`})}/></>}
    {mode === "range" && <><DatePicker label="Dari" name="start" today={today} defaultValue={start} onValueChange={value=>range(value,end)}/><DatePicker label="Sampai" name="end" today={today} defaultValue={end} onValueChange={value=>range(start,value)}/></>}
    </>}{filters.map(filter=><Dropdown key={`${filter.name}-${params.get(filter.name)}`} label={filter.label} name={filter.name} defaultValue={params.get(filter.name) ?? ""} options={filter.options} onValueChange={value=>update({[filter.name]:value})}/>)}
    {search && <label className="search-field">Pencarian<span className="search-control"><Icon name="search" size={17}/><input type="search" value={query} placeholder="Ketik untuk mencari" onChange={event=>{ const value=event.target.value;setQuery(value);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>update({q:value}),300); }}/></span></label>}</div>
    {(error || period.error) && <p className="filter-error" role="alert">{error || period.error}</p>}
    <span className="sr-only" role="status">{pending ? "Memuat data" : "Data diperbarui"}</span>
  </div>;
}
