"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingNavigation } from "./app-navigation";

type Layout = "dashboard" | "list" | "groups" | "detail" | "analysis" | "people" | "settings" | "login";
type Module = { title: string; layout: Layout; tabs?: number; filters?: number; search?: boolean; actions?: number; add?: boolean; monthly?: boolean; all?: boolean };

const modules: Record<string, Module> = {
  "/": { title: "Beranda", layout: "dashboard" },
  "/login": { title: "Masuk", layout: "login" },
  "/penjualan": { title: "Penjualan", layout: "list", filters: 2, search: true, add: true },
  "/pembelian": { title: "Pembelian", layout: "list", filters: 1, search: true, add: true },
  "/keuangan": { title: "Buku keuangan", layout: "list", filters: 3, search: true, actions: 3 },
  "/lainnya": { title: "Lainnya", layout: "groups" },
  "/dokumen": { title: "Dokumen operasional", layout: "list", filters: 2, search: true },
  "/penerimaan": { title: "Timbang penerimaan", layout: "list", filters: 0, add: true },
  "/produksi": { title: "Produksi", layout: "list", filters: 1, search: true, add: true },
  "/stok": { title: "Produk & stok", layout: "list", tabs: 2, actions: 2 },
  "/riwayat": { title: "Riwayat", layout: "list", tabs: 2, filters: 2, search: true },
  "/tagihan": { title: "Piutang & hutang", layout: "list", tabs: 2, filters: 1, search: true, all: true },
  "/setoran": { title: "Setoran penagih", layout: "list", filters: 1, search: true, add: true },
  "/sdm": { title: "SDM", layout: "people", actions: 3, add: true },
  "/aset": { title: "Aset tetap", layout: "list", add: true },
  "/akuntansi": { title: "Akuntansi", layout: "list", tabs: 3, filters: 0, monthly: true },
  "/analisis": { title: "Analisis usaha", layout: "analysis", filters: 0, monthly: true },
  "/data": { title: "Data utama", layout: "settings", tabs: 5, add: true },
};

function Block({ className = "" }: { className?: string }) {
  return <span className={`skeleton loading-block ${className}`}/>;
}

function Tabs({ count }: { count: number }) {
  return <div className="loading-tabs">{Array.from({length:count},(_,i)=><Block key={i}/>)}</div>;
}

function Actions({ count }: { count: number }) {
  return <div className="loading-actions">{Array.from({length:count},(_,i)=><Block key={i}/>)}</div>;
}

function Filters({ count, search, mode }: { count: number; search?: boolean; mode: string }) {
  const dates = mode === "all" ? 1 : mode === "date" ? 2 : 3;
  return <div className="loading-filters">{Array.from({length:dates+count},(_,i)=><div className="loading-filter" key={i}><Block className="loading-label"/><Block className="loading-control"/></div>)}{search&&<div className="loading-filter loading-search"><Block className="loading-label"/><Block className="loading-control"/></div>}</div>;
}

function List({ add = false, rows = 4 }: { add?: boolean; rows?: number }) {
  return <><div className="loading-section"><Block className="loading-section-title"/>{add&&<Block className="loading-add"/>}</div><div className="loading-list">{Array.from({length:rows},(_,i)=><div className="loading-row" key={i}><div><Block className="loading-row-title"/><Block className="loading-row-subtitle"/></div><Block className="loading-row-amount"/></div>)}</div></>;
}

function Content({ config, pathname, mode, tab }: { config: Module; pathname: string; mode: string; tab: string }) {
  if(config.layout === "dashboard") return <><div className="loading-greeting"><Block className="loading-section-title"/><Block className="loading-greeting-title"/><Block className="loading-row-subtitle"/></div><Actions count={4}/><div className="loading-dashboard-header"><Block className="loading-section-title"/><Block className="loading-dashboard-filter"/></div><div className="loading-kpis">{Array.from({length:3},(_,i)=><div className="loading-kpi" key={i}><Block className="loading-label"/><Block className="loading-kpi-value"/><Block className="loading-row-subtitle"/></div>)}</div><div className="loading-panels"><div><List rows={3}/></div><div><List rows={2}/></div></div></>;
  if(config.layout === "groups") return <div className="loading-groups">{[5,4,3].map((rows,i)=><section key={i}><Block className="loading-section-title"/><div className="loading-list">{Array.from({length:rows},(_,j)=><div className="loading-row" key={j}><div><Block className="loading-row-title"/><Block className="loading-row-subtitle"/></div></div>)}</div></section>)}</div>;
  if(config.layout === "detail") return <><div className="loading-detail"><Block className="loading-section-title"/><Block className="loading-row-subtitle"/><Block className="loading-row-amount"/></div><List rows={3}/><List rows={2}/></>;
  if(config.layout === "people") return <><Actions count={config.actions??0}/><List add rows={3}/><Filters count={0} mode={mode}/><List rows={3}/></>;
  if(config.layout === "settings" && tab === "usaha") return <><Tabs count={config.tabs??0}/><div className="loading-detail loading-settings"><Block className="loading-section-title"/><Block className="loading-control"/><Block className="loading-control"/><Block className="loading-control"/></div></>;
  return <>{config.actions&&<Actions count={config.actions}/>} {config.tabs&&<Tabs count={config.tabs}/>} {(config.filters!==undefined||pathname==="/stok"&&tab==="riwayat")&&<Filters count={config.filters??0} search={config.search||pathname==="/stok"} mode={mode}/>} {config.layout==="analysis"&&<Block className="loading-notice"/>}<List add={config.add}/>{config.layout==="analysis"&&<List rows={2}/>}</>;
}

function Screen({ pathname, mode, tab }: { pathname: string; mode?: string; tab?: string }) {
  const config = modules[pathname]??(pathname.startsWith("/dokumen/")?{title:"Dokumen",layout:"detail" as const}:{title:"Memuat",layout:"list" as const});
  if(config.layout==="login") return <main className="loading-login" role="status" aria-label="Memuat halaman masuk"><span className="sr-only">Memuat halaman masuk…</span><div aria-hidden="true"><Block className="loading-login-logo"/><Block className="loading-greeting-title"/><Block className="loading-control"/><Block className="loading-control"/><Block className="loading-control"/></div></main>;
  const period=mode??(config.all?"all":config.monthly?"month":"date");
  return <div className="app-layout loading-app">
    <LoadingNavigation pathname={pathname} placement="sidebar"/>
    <div className="app-main"><header className="app-header"><div className="header-title"><h1>{config.title}</h1></div><span aria-hidden="true"><Block className="loading-header-action"/></span></header><main id="main-content" className="page-content" role="status" aria-busy="true" aria-label={`Memuat ${config.title}`}><span className="sr-only">Memuat {config.title}…</span><div aria-hidden="true"><Content config={config} pathname={pathname} mode={period} tab={tab??""}/></div></main></div>
    <LoadingNavigation pathname={pathname} placement="bottom"/>
  </div>;
}

function RouteScreen({ pathname }: { pathname: string }) {
  const params=useSearchParams();
  return <Screen pathname={pathname} mode={params.get("period")??undefined} tab={params.get("tab")??undefined}/>;
}

export function LoadingScreen() {
  const pathname=usePathname()||"/";
  return <Suspense fallback={<Screen pathname={pathname}/>}><RouteScreen pathname={pathname}/></Suspense>;
}
