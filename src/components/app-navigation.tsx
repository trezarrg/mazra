"use client";
import { branding } from "@/lib/branding";


import Image from "next/image";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { logout } from "@/app/actions";
import { Icon, type IconName } from "./icon";

export type Destination = "home" | "stock" | "data" | "purchase" | "sale" | "finance" | "more";
type Item = { id: Destination; href: string; label: string; icon: IconName };

let savedRoles: string[] | null = null;
let savedBrand = branding;
const listeners = new Set<() => void>();
function updateRoles(roles: string[] | null) {
  if (JSON.stringify(savedRoles) === JSON.stringify(roles)) return;
  savedRoles = roles;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function getRoles() { return savedRoles; }
function getServerRoles() { return null; }
function getBrand() { return savedBrand; }
function getServerBrand() { return branding; }

export function RememberNavigation({ roles, brand = branding }: { roles: string[]; brand?:typeof branding }) {
  useEffect(() => {
    if (savedBrand.name!==brand.name || savedBrand.logo!==brand.logo) { savedBrand=brand; listeners.forEach(listener=>listener()); }
    updateRoles(roles);
  }, [roles,brand]);
  return null;
}

export function ClearNavigation() {
  useEffect(() => { updateRoles(null); }, []);
  return null;
}

function itemsFor(roles: string[]): Item[] {
  const office = roles.some(r => ["developer", "owner", "admin"].includes(r));
  return [
    { id: "home", href: "/", label: "Beranda", icon: "home" },
    ...(office || roles.includes("driver") ? [{ id: "sale" as const, href: "/penjualan", label: "Penjualan", icon: "file" as const }] : []),
    ...(office ? [{ id: "purchase" as const, href: "/pembelian", label: "Pembelian", icon: "file" as const }] : []),
    ...(office ? [{ id: "finance" as const, href: "/keuangan", label: "Keuangan", icon: "wallet" as const }] : []),
    { id: "more", href: "/lainnya", label: "Lainnya", icon: "grid" },
  ];
}

export function Sidebar({ roles, active, brand=branding }: { roles: string[]; active: Destination; brand?:typeof branding }) {
  const selected = active === "stock" || active === "data" ? "more" : active;
  return <aside className="sidebar">
    <Link href="/" className="sidebar-brand" aria-label="Beranda"><Image src={brand.logo} alt={brand.name} width={150} height={100} unoptimized/></Link>
    <span className="nav-label">RUANG KERJA</span>
    <nav aria-label="Navigasi desktop">{itemsFor(roles).map(item => <Link key={item.id} href={item.href} className={`side-link ${selected === item.id ? "is-active" : ""}`} aria-current={selected === item.id ? "page" : undefined}>{item.label}</Link>)}</nav>
    <div className="sidebar-footer"><div><strong>{brand.name}</strong><small>Operasional usaha</small></div><form action={logout} onSubmit={() => updateRoles(null)}><button className="icon-button" aria-label="Keluar dari akun"><Icon name="logout" size={18}/></button></form></div>
  </aside>;
}

export function BottomNavigation({ roles, active }: { roles: string[]; active: Destination }) {
  const selected = active === "stock" || active === "data" ? "more" : active;
  return <nav className="bottom-nav" aria-label="Navigasi utama">{itemsFor(roles).map(item => <Link key={item.id} href={item.href} className={selected === item.id ? "is-active" : ""} aria-current={selected === item.id ? "page" : undefined}><span className="bottom-icon"><Icon name={item.icon} size={20}/></span><span>{item.label}</span></Link>)}</nav>;
}

function destination(pathname: string): Destination {
  if (pathname === "/") return "home";
  if (pathname === "/penjualan") return "sale";
  if (pathname === "/pembelian") return "purchase";
  if (["/keuangan", "/tagihan"].includes(pathname)) return "finance";
  return "more";
}

export function LoadingNavigation({ pathname, placement }: { pathname: string; placement: "sidebar" | "bottom" }) {
  const roles = useSyncExternalStore(subscribe, getRoles, getServerRoles);
  const brand = useSyncExternalStore(subscribe,getBrand,getServerBrand);
  if (!roles) return placement === "sidebar" ? <aside className="sidebar"><div className="sidebar-brand"><Image src={brand.logo} alt={brand.name} width={150} height={100} unoptimized/></div></aside> : null;
  return placement === "sidebar" ? <Sidebar roles={roles} active={destination(pathname)} brand={brand}/> : <BottomNavigation roles={roles} active={destination(pathname)}/>;
}
