import { branding } from "@/lib/branding";
import { formatDecimal } from "@/lib/format";
import Image from "next/image";
import { requireAccess } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { Sheet } from "@/components/sheet";
import { EmptyState, ListRow, Notice, SectionHeading, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addProfile, saveProfile, saveSettings } from "./actions";
import { AccountForm, Active, PartnerForm, ProductForm, RoleChecks, UnitForm, VariantForm, type Account, type Partner, type Product, type Profile, type UnitCatalog } from "./forms";

export default async function DataPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; tab?: string }> }) {
  const { db, role, roles } = await requireAccess(["developer", "owner", "admin"]);
  const canManageUsers = roles.some(r => ["developer", "owner"].includes(r));
  const query = await searchParams;
  const sections = [{ id: "mitra", label: "Mitra" }, { id: "produk", label: "Produk" }, { id: "satuan", label: "Satuan" }, { id: "akun", label: "Akun kas" }, { id: "usaha", label: "Usaha" }, ...(canManageUsers ? [{ id: "pengguna", label: "Pengguna" }] : [])];
  const tab = sections.some(s => s.id === query.tab) ? query.tab! : "mitra";
  const [partners, products, accounts, profiles, settings, units] = await Promise.all([
    db.from("partners").select("*").order("name"),
    db.from("products").select("*, product_units(unit), product_variants(id,name,active)").order("name"),
    db.from("cash_accounts").select("*").order("name"),
    db.from("profiles").select("id,full_name,role,active,profile_extra_roles(role)").neq("role","developer").order("full_name"),
    db.from("business_settings").select("*").eq("id", true).single(),
    db.from("unit_catalog").select("code,name,whole_only,active").order("name"),
  ]);
  const unitList = (units.data ?? []) as UnitCatalog[];
  const accountPeople = (profiles.data ?? []) as Profile[];
  const people = accountPeople.filter(p=>p.role!=="developer");
  const plus = <><Icon name="plus" size={18}/><span>Tambah</span></>;
  return <AppShell title="Data utama" active="data" role={role} roles={roles}>
    {query.error && <Notice error>{query.error}</Notice>}{query.ok && <Notice>Perubahan berhasil disimpan.</Notice>}
    {[partners, products, accounts, profiles, settings, units].some(r => r.error) && <Notice error>Sebagian data tidak dapat dimuat. Coba muat ulang halaman.</Notice>}
    <Tabs active={tab} items={sections.map(s => ({ ...s, href: "/data?tab=" + s.id }))}/>
    {tab === "mitra" && <><SectionHeading title="Daftar mitra" count={partners.data?.length} action={<Sheet title="Mitra baru" trigger={plus}><PartnerForm/></Sheet>}/><div className="list-card">{(partners.data as Partner[] | null)?.map(p => <Sheet key={p.id} title="Edit mitra" className="row-button" trigger={<ListRow title={p.name} icon="users" subtitle={[p.is_supplier && "Supplier", p.is_customer && "Pelanggan", p.phone, !p.active && "Nonaktif"].filter(Boolean).join(" · ")} muted={!p.active} trailing={<Icon name="chevron" size={18}/>}/>}><PartnerForm partner={p}/></Sheet>)}{!partners.error && !partners.data?.length && <EmptyState title="Belum ada mitra" description="Tambahkan pelanggan atau supplier pertama." icon="users"/>}</div></>}
    {tab === "produk" && <><SectionHeading title="Katalog produk" count={products.data?.length} action={<Sheet title="Produk baru" trigger={plus}><ProductForm units={unitList}/></Sheet>}/><div className="list-card">{(products.data as Product[] | null)?.map(p => <Sheet key={p.id} title={p.name} className="row-button" trigger={<ListRow title={p.name} icon="box" subtitle={p.product_units.map(u => u.unit).join(" / ") + (p.product_variants.length ? " · " + formatDecimal(p.product_variants.length) + " varian" : "") + (!p.active ? " · Nonaktif" : "")} muted={!p.active} trailing={<Icon name="chevron" size={18}/>}/>}><ProductForm product={p} units={unitList}/><div className="subsection"><h3>Varian ukuran</h3>{p.product_variants.map(v => <VariantForm key={v.id} productId={p.id} variant={v}/>)}<details className="form-details"><summary><Icon name="plus" size={17}/> Tambah varian</summary><VariantForm productId={p.id}/></details></div></Sheet>)}{!products.error && !products.data?.length && <EmptyState title="Katalog masih kosong" description="Tambahkan produk yang dijual."/>}</div></>}
    {tab === "satuan" && <><SectionHeading title="Satuan" count={unitList.length} action={<Sheet title="Satuan baru" trigger={plus}><UnitForm/></Sheet>}/><div className="list-card">{unitList.map(unit => <Sheet key={unit.code} title="Edit satuan" className="row-button" trigger={<ListRow title={unit.name} subtitle={unit.code + (unit.whole_only ? " · Bilangan bulat" : " · Bisa desimal") + (!unit.active ? " · Nonaktif" : "")} muted={!unit.active} trailing={<Icon name="chevron" size={18}/>}/>}><UnitForm unit={unit}/></Sheet>)}{!units.error && !unitList.length && <EmptyState title="Belum ada satuan"/>}</div></>}
    {tab === "akun" && <><SectionHeading title="Kas & rekening" count={accounts.data?.length} action={<Sheet title="Akun baru" trigger={plus}><AccountForm/></Sheet>}/><div className="list-card">{(accounts.data as Account[] | null)?.map(a => <Sheet key={a.id} title="Edit akun" className="row-button" trigger={<ListRow title={a.name} icon={a.account_type === "bank" ? "bank" : "wallet"} subtitle={(a.account_type === "bank" ? "Rekening bank" : "Kas tunai") + (!a.active ? " · Nonaktif" : "")} muted={!a.active} trailing={<Icon name="chevron" size={18}/>}/>}><AccountForm account={a}/></Sheet>)}{!accounts.error && !accounts.data?.length && <EmptyState title="Belum ada akun" icon="wallet"/>}</div><p className="caption">Saldo tiap akun akan dicatat di buku keuangan.</p></>}
    {tab === "usaha" && settings.data && <><SectionHeading title="Identitas usaha"/><div className="settings-card"><div className="business-identity"><span className="brand-mark large brand-logo"><Image src={branding.logo} alt="" width={64} height={64}/></span><div><strong>{settings.data.name}</strong><span>Profil usaha</span></div></div><form action={saveSettings} className="form"><label>Nama usaha<input name="name" required maxLength={200} defaultValue={settings.data.name} disabled={!canManageUsers}/></label><label>Nomor telepon<input name="phone" type="tel" maxLength={50} defaultValue={settings.data.phone ?? ""} disabled={!canManageUsers}/></label><label>Alamat<textarea name="address" maxLength={1000} defaultValue={settings.data.address ?? ""} disabled={!canManageUsers}/></label><div className="setting-facts"><span>Mata uang<strong>IDR · Rupiah</strong></span><span>Zona waktu<strong>Asia/Jakarta</strong></span></div>{canManageUsers && <SubmitButton>Simpan pengaturan</SubmitButton>}</form></div></>}
    {tab === "pengguna" && canManageUsers && <><SectionHeading title="Tim & akses" count={people.length} action={<Sheet title="Tambahkan akses" description="Gunakan email akun yang sudah dibuat dan dikonfirmasi di Supabase Auth." trigger={plus}><form action={addProfile} className="form"><label>Email<input type="email" name="email" required/></label><label>Nama lengkap<input name="name" required maxLength={200}/></label><RoleChecks/><SubmitButton>Tambahkan akses</SubmitButton></form></Sheet>}/><div className="list-card">{!profiles.error && people.length === 0 && <EmptyState title="Belum ada pengguna" icon="users"/>}{people.map(p => <Sheet key={p.id} title="Edit akses pengguna" className="row-button" trigger={<ListRow title={p.full_name} icon="shield" subtitle={[p.role, ...(p.profile_extra_roles ?? []).map(r => r.role)].join(" / ") + (!p.active ? " · Nonaktif" : "")} trailing={<span className={"badge " + (p.active ? "badge-green" : "")}>{p.active ? "Aktif" : "Nonaktif"}</span>}/>}><form action={saveProfile} className="form"><input type="hidden" name="id" value={p.id}/><label>Nama lengkap<input name="name" defaultValue={p.full_name} required maxLength={200}/></label><RoleChecks selected={[p.role, ...(p.profile_extra_roles ?? []).map(r => r.role)]}/><Active value={p.active}/><SubmitButton>Simpan akses</SubmitButton></form></Sheet>)}</div></>}
  </AppShell>;
}
