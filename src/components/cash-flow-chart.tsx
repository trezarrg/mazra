"use client";

import { useCallback, useId, useState } from "react";
import { formatDecimal } from "@/lib/format";
import { cents, fromCents } from "@/lib/money";
import type { Trend } from "@/lib/summary";
import { AnimatedNumber } from "./animated-number";

const monthLabel = (month: string, long = false) => new Intl.DateTimeFormat("id-ID", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const compact = (value: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function CashFlowChart({ rows, months, error = false }: { rows: Trend[]; months: string[]; error?: boolean }) {
  const id = useId();
  const [width, setWidth] = useState(600);
  const canvas = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const data = months.map(month => rows.find(row => row.month === month) ?? { month, incoming: "0", outgoing: "0", net: "0" });
  const current = data.find(row => row.month === selected);
  const sum = (key: "incoming" | "outgoing" | "net") => fromCents(data.reduce((total, row) => total + cents(row[key]), BigInt(0)));
  const incoming = current?.incoming ?? sum("incoming");
  const outgoing = current?.outgoing ?? sum("outgoing");
  const net = current?.net ?? sum("net");
  // Number is only for chart geometry; displayed totals retain decimal precision.
  const peak = Math.max(...data.flatMap(row => [Number(row.incoming), Number(row.outgoing)]), 0);
  const scale = peak > 0 ? Math.pow(10, Math.floor(Math.log10(peak))) : 1;
  const maximum = peak > 0 ? Math.ceil(peak / scale) * scale : 1;
  const left = 52, top = 16, height = 170, slot = (width - left - 14) / Math.max(data.length, 1);
  return <section className="dashboard-panel cash-chart" aria-labelledby={`${id}-heading`}>
    <div className="panel-heading"><div><h2 id={`${id}-heading`}>Arus kas</h2><p>6 bulan terakhir{months.length > 0 && ` · ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1], true)}`}</p></div><span className="chart-unit">Rupiah</span></div>
    {error ? <div className="chart-unavailable" role="status">Grafik belum dapat dimuat. Silakan muat ulang halaman.</div> : <>
      <div className="chart-totals" aria-live="polite"><div><span className="chart-key incoming">Kas masuk</span><strong>Rp <AnimatedNumber value={incoming}/></strong></div><div><span className="chart-key outgoing">Kas keluar</span><strong>Rp <AnimatedNumber value={outgoing}/></strong></div><div><span>Selisih kas</span><strong className={cents(net) < BigInt(0) ? "amount-negative" : "amount-positive"}>Rp <AnimatedNumber value={net}/></strong></div></div>
      <div className="chart-selection"><span>{current ? monthLabel(current.month, true) : "Total enam bulan"}</span>{current && <button type="button" onClick={() => setSelected(null)}>Lihat total</button>}</div>
      <div className="chart-canvas" ref={canvas}>
        <svg viewBox={`0 0 ${width} 222`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>Kas masuk dan kas keluar per bulan</title><desc id={`${id}-description`}>Gunakan tombol bulan di bawah grafik untuk membaca nilai lengkap. Batang hijau menunjukkan kas masuk; batang cokelat menunjukkan kas keluar.</desc>
          {[0, 1, 2, 3, 4].map(tick => { const y = top + height * tick / 4; return <g key={tick}><line className="chart-gridline" x1={left} x2={width - 10} y1={y} y2={y}/><text className="chart-axis" x={left - 10} y={y + 4} textAnchor="end">{peak === 0 ? (tick === 4 ? "0" : "") : compact(maximum * (4 - tick) / 4)}</text></g>; })}
          {data.map((row, i) => { const x = left + slot * (i + .5); const bar = Math.min(19, slot * .22); return <g key={row.month} className={selected && selected !== row.month ? "chart-dimmed" : undefined}>
            <rect className="chart-hover-zone" x={left + slot * i + 3} y={top} width={slot - 6} height={height} rx={5} onMouseEnter={() => setSelected(row.month)} onClick={() => setSelected(row.month)}><title>{`${monthLabel(row.month, true)}: masuk Rp ${formatDecimal(row.incoming)}, keluar Rp ${formatDecimal(row.outgoing)}`}</title></rect>
            <rect className="chart-bar-in" pointerEvents="none" x={x - bar - 2} y={top + height - Number(row.incoming) / maximum * height} width={bar} height={Number(row.incoming) / maximum * height} rx={3}/>
            <rect className="chart-bar-out" pointerEvents="none" x={x + 2} y={top + height - Number(row.outgoing) / maximum * height} width={bar} height={Number(row.outgoing) / maximum * height} rx={3}/>
            <text className="chart-axis" x={x} y={210} textAnchor="middle">{monthLabel(row.month)}</text>
          </g>; })}
        </svg>
        {peak === 0 && <p className="chart-empty">Belum ada pergerakan kas<br/><span>Grafik terisi saat transaksi tercatat.</span></p>}
      </div>
      <div className="chart-months" aria-label="Detail arus kas per bulan">{data.map(row => <button type="button" key={row.month} aria-pressed={selected === row.month} aria-label={`Lihat ${monthLabel(row.month, true)}`} onClick={() => setSelected(selected === row.month ? null : row.month)}>{monthLabel(row.month)}</button>)}</div>
      <p className="panel-footnote">Termasuk saldo awal, transfer internal, dan koreksi. Grafik memiliki periode enam bulan tersendiri.</p>
    </>}
  </section>;
}
