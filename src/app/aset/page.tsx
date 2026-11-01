import Link from "next/link";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";
import { formatDate,formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { EmptyState,ListRow,Notice,SectionHeading } from "@/components/ui";
export default async function Page(){const {db,role,roles}=await requireAccess(officeRoles);const result=await db.from("fixed_assets").select("*").order("acquisition_date",{ascending:false});return <AppShell title="Aset tetap" active="more" role={role} roles={roles}>{result.error&&<Notice error>Data aset tidak dapat dimuat.</Notice>}<SectionHeading title="Daftar aset" action={<Link className="button button-primary" href="/keuangan">Catat aset</Link>}/><p className="caption">Catat perolehan atau penjualan melalui buku keuangan dengan kategori aset tetap. Penyusutan belum ditetapkan; nilai perolehan belum menjadi nilai buku final.</p><div className="list-card">{result.data?.map(a=><Link key={a.id} href={`/dokumen/${a.disposed_by??a.id}`}><ListRow title={a.name} subtitle={`${formatDate(a.acquisition_date)} · ${a.disposed_by?"Dilepas / dikoreksi":"Aktif"}`} trailing={<strong>Rp{formatDecimal(a.cost)}</strong>}/></Link>)}{!result.error&&!result.data?.length&&<EmptyState title="Belum ada aset tetap"/>}</div></AppShell>;}
