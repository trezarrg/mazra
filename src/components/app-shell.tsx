import { branding } from "@/lib/branding";
import { logout } from "@/app/actions";
import { Icon } from "./icon";
import { BottomNavigation, RememberNavigation, Sidebar, type Destination } from "./app-navigation";

export function AppShell({ title, active, role, roles = [role], children, action }: { title: string; active: Destination; role: string; roles?: string[]; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="app-layout">
    <RememberNavigation roles={roles}/>
    <a className="skip-link" href="#main-content">Lewati ke konten</a>
    <Sidebar roles={roles} active={active}/>
    <div className="app-main">
      <header className="app-header"><div className="header-title"><h1>{title}</h1></div><div className="header-actions">{action}<span className="workspace-label">{branding.name}</span><form action={logout} className="mobile-logout"><button className="icon-button" aria-label="Keluar dari akun"><Icon name="logout" size={18}/></button></form></div></header>
      <main id="main-content" className="page-content">{children}</main>
    </div>
    <BottomNavigation roles={roles} active={active}/>
  </div>;
}
