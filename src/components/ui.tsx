import { formatDecimal } from "@/lib/format";
import Link from "next/link";
import { Icon, type IconName } from "./icon";

export function EmptyState({ title, description, icon = "box" }: { title: string; description?: string; icon?: IconName }) {
  return <div className="empty-state"><span className="empty-orbit"><Icon name={icon} size={28}/></span><h3>{title}</h3>{description && <p>{description}</p>}</div>;
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`notice ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}><Icon name={error ? "shield" : "check"} size={19}/><span>{children}</span></div>; }
export function Tabs({ items, active }: { items: { id: string; label: string; href: string }[]; active: string }) { return <nav className="segmented-tabs" aria-label="Kategori">{items.map(item => <Link key={item.id} href={item.href} className={item.id === active ? "is-active" : ""} aria-current={item.id === active ? "page" : undefined}>{item.label}</Link>)}</nav>; }
export function SectionHeading({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) { return <div className="section-heading"><h2>{title}{count !== undefined && <span className="count-badge">{formatDecimal(count)}</span>}</h2>{action}</div>; }
export function ListRow({ title, subtitle, trailing, muted = false }: { title: string; subtitle?: string; icon?: IconName; trailing?: React.ReactNode; muted?: boolean }) { return <span className={`list-row ${muted ? "is-muted" : ""}`}><span className="row-copy"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>{trailing && <span className="row-trailing">{trailing}</span>}</span>; }
