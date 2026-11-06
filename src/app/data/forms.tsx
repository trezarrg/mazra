import { Dropdown } from "@/components/dropdown";
import { saveAccount, savePartner, saveProduct, saveUnit, saveVariant } from "./actions";
import { SubmitButton } from "@/components/submit-button";
export type Partner = { id: string; name: string; is_supplier: boolean; is_customer: boolean; phone: string | null; address: string | null; notes: string | null; active: boolean };
export type Unit = { unit: string };
export type UnitCatalog = { code: string; name: string; whole_only: boolean; active: boolean };
export type Variant = { id: string; name: string; active: boolean };
export type Product = { id: string; name: string; active: boolean; product_units: Unit[]; product_variants: Variant[] };
export type Account = { id: string; name: string; account_type: string; active: boolean };
export type Profile = { id: string; full_name: string; role: string; active: boolean; profile_extra_roles: { role: string }[] };
export function roleOptions() { return [ { value: "owner", label: "Owner" }, { value: "admin", label: "Admin" }, { value: "production", label: "Produksi" }, { value: "driver", label: "Sopir" }]; }

export function RoleChecks({ selected = ["admin"] }: { selected?: string[] }) { return <><span className="field-label">Peran</span><div className="checks">{roleOptions().map(role => <label className="check" key={role.value}><input type="checkbox" name="roles" value={role.value} defaultChecked={selected.includes(role.value)}/> {role.label}</label>)}</div></>; }

export function Active({ value = true }: { value?: boolean }) { return <label className="check"><input type="checkbox" name="active" defaultChecked={value} /> Aktif</label>; }
export function PartnerForm({ partner }: { partner?: Partner }) {
  return <form action={savePartner} className="form compact"><input type="hidden" name="id" value={partner?.id ?? ""}/><label>Nama<input name="name" required maxLength={200} defaultValue={partner?.name}/></label><div className="checks"><label className="check"><input type="checkbox" name="supplier" defaultChecked={partner?.is_supplier}/> Supplier</label><label className="check"><input type="checkbox" name="customer" defaultChecked={partner?.is_customer}/> Pelanggan</label><Active value={partner?.active}/></div><label>Telepon<input name="phone" maxLength={50} defaultValue={partner?.phone ?? ""}/></label><label>Alamat<textarea name="address" maxLength={1000} defaultValue={partner?.address ?? ""}/></label><label>Catatan<textarea name="notes" maxLength={1000} defaultValue={partner?.notes ?? ""}/></label><SubmitButton>Simpan mitra</SubmitButton></form>;
}
export function ProductForm({ product, units }: { product?: Product; units: UnitCatalog[] }) {
  const selected = product?.product_units.map(item => item.unit) ?? (units.find(unit => unit.active && unit.code === "kg") ? ["kg"] : []);
  return <form action={saveProduct} className="form compact"><input type="hidden" name="id" value={product?.id ?? ""}/><label>Nama produk<input name="name" required maxLength={200} defaultValue={product?.name}/></label><span className="field-label">Satuan yang digunakan</span><div className="checks">{units.filter(unit => unit.active || selected.includes(unit.code)).map(unit => <label className="check" key={unit.code}><input type="checkbox" name="units" value={unit.code} defaultChecked={selected.includes(unit.code)}/> {unit.code}{!unit.active && " (nonaktif)"}</label>)}<Active value={product?.active}/></div><SubmitButton>Simpan produk</SubmitButton></form>;
}
export function VariantForm({ productId, variant }: { productId: string; variant?: Variant }) {
  return <form action={saveVariant} className="inline-form"><input type="hidden" name="product_id" value={productId}/><input type="hidden" name="id" value={variant?.id ?? ""}/><label>Nama varian<input name="name" required maxLength={200} defaultValue={variant?.name}/></label><Active value={variant?.active}/><SubmitButton>Simpan varian</SubmitButton></form>;
}
export function AccountForm({ account }: { account?: Account }) {
  return <form action={saveAccount} className="form compact"><input type="hidden" name="id" value={account?.id ?? ""}/><label>Nama akun<input name="name" required maxLength={200} defaultValue={account?.name}/></label><Dropdown label="Jenis" name="account_type" defaultValue={account?.account_type ?? "cash"} options={[{value:"cash",label:"Kas"},{value:"bank",label:"Bank"}]}/><Active value={account?.active}/><SubmitButton>Simpan akun</SubmitButton></form>;
}


export function UnitForm({ unit }: { unit?: UnitCatalog }) {
  return <form action={saveUnit} className="form"><label>Kode satuan<input name="code" required maxLength={20} pattern="[a-z][a-z0-9_]*" defaultValue={unit?.code} readOnly={!!unit} placeholder="Contoh: kg"/></label><label>Nama satuan<input name="name" required maxLength={60} defaultValue={unit?.name} placeholder="Contoh: Kilogram"/></label>{unit ? <><input type="hidden" name="existing" value="1"/><p className="caption">{unit.whole_only ? "Jumlah satuan ini harus bilangan bulat." : "Jumlah satuan ini dapat memakai desimal."}</p><Active value={unit.active}/></> : <label className="check"><input type="checkbox" name="whole_only"/> Hanya bilangan bulat (misalnya ekor atau pcs)</label>}<SubmitButton>Simpan satuan</SubmitButton></form>;
}
