"use client";
import { useEffect, useId, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { Dropdown } from "./dropdown";
import { Icon } from "./icon";
import { useFloatingPopup } from "./use-floating-popup";

const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const weekdays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const iso = (date: Date) => date.toISOString().slice(0, 10);
const parse = (value: string) => new Date(`${value}T00:00:00Z`);

export function DatePicker({ label, name, today, defaultValue = "", locked = false, optional = false, onValueChange }: { label: string; name: string; today: string; defaultValue?: string; locked?: boolean; optional?: boolean; onValueChange?: (value: string) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [month, setMonth] = useState(() => (defaultValue || today).slice(0, 7));
  const [open, setOpen] = useState(false);
  const { anchor: trigger, popup } = useFloatingPopup(open);
  useEffect(() => {
    const form = hidden.current?.form;
    const reset = () => { setValue(defaultValue); setMonth((defaultValue || today).slice(0, 7)); setOpen(false); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, today]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (pendingFocus.current) { root.current?.querySelector<HTMLButtonElement>(`[data-date="${pendingFocus.current}"]`)?.focus(); pendingFocus.current = null; }
  }, [month]);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const years = Array.from({ length: 201 }, (_, i) => ({ value: String(year - 100 + i), label: String(year - 100 + i) }));
  function setView(y: number, m: number) { setMonth(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`); }
  function stepMonth(offset: number) { const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1)); setView(date.getUTCFullYear(), date.getUTCMonth() + 1); }
  function choose(date: string) { setValue(date); onValueChange?.(date); setMonth(date.slice(0, 7)); setOpen(false); trigger.current?.focus(); }
  function move(event: React.KeyboardEvent<HTMLButtonElement>, date: string) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in offsets)) return;
    event.preventDefault(); const target = parse(date); target.setUTCDate(target.getUTCDate() + offsets[event.key]); const next = iso(target);
    if (next.slice(0, 7) !== month) { pendingFocus.current = next; setMonth(next.slice(0, 7)); }
    else root.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
  }
  return <div className="date-picker" ref={root}>
    <label htmlFor={`${id}-trigger`}>{label}{optional && <span className="optional">opsional</span>}</label>
    <input ref={hidden} type="hidden" name={name} value={value}/>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="date-trigger" disabled={locked} aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => { setMonth((value || today).slice(0, 7)); setOpen(!open); }} onKeyDown={e => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}><span>{value ? formatDate(value) : "Pilih tanggal"}</span><Icon name="calendar" size={18}/></button>
    {open && <div ref={popup} popover="manual" id={`${id}-calendar`} className="calendar-popover floating-popup" onKeyDown={e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
      <div className="calendar-heading"><button type="button" className="calendar-nav" aria-label="Bulan sebelumnya" onClick={() => stepMonth(-1)}><Icon name="chevron" size={16}/></button><div className="calendar-selects"><Dropdown key={`m${month}`} label="Bulan" name="_calendar_month" defaultValue={String(monthNumber)} options={months.map((label, i) => ({ label, value: String(i + 1) }))} onValueChange={v => setView(year, Number(v))}/><Dropdown key={`y${month}`} label="Tahun" name="_calendar_year" defaultValue={String(year)} options={years} onValueChange={v => setView(Number(v), monthNumber)}/></div><button type="button" className="calendar-nav next" aria-label="Bulan berikutnya" onClick={() => stepMonth(1)}><Icon name="chevron" size={16}/></button></div>
      <div className="calendar-grid">{weekdays.map(day => <span className="calendar-weekday" key={day}>{day}</span>)}{Array.from({length:firstDay}, (_, i) => <span key={`blank-${i}`}/>)}{Array.from({length:total}, (_, i) => { const date = `${month}-${String(i+1).padStart(2,"0")}`; return <button type="button" key={date} data-date={date} className={`calendar-day${date === value ? " is-selected" : ""}${date === today ? " is-today" : ""}`} aria-label={formatDate(date)} aria-pressed={date === value} onClick={() => choose(date)} onKeyDown={e => move(e,date)}>{i+1}</button>; })}</div>
      <div className="calendar-footer">{optional && <button type="button" onClick={() => { setValue(""); onValueChange?.(""); setOpen(false); trigger.current?.focus(); }}>Kosongkan</button>}<button type="button" onClick={() => choose(today)}>Hari ini</button></div>
    </div>}
  </div>;
}
