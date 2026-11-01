"use client";
import { useState } from "react";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { saveOperation } from "@/app/operasi/actions";
import { formatDecimal } from "@/lib/format";
import type { ItemData, OperationData, Option, Product } from "@/lib/operations";

export type FormOptions = { products: Product[]; partners: Option[]; accounts: Option[]; paymentAccounts?: Option[]; collectorAccounts?: Option[]; collectors?: Option[]; drivers?: Option[]; assignees?: Option[]; categories?: (Option & { direction: string })[]; assets?: Option[] };
const blank = (direction = "out"): ItemData => ({product:"",variant:"",unit:"kg",quantity:"",price:"",weight:"",direction});
type OperationFormProps = { id: string; kind: string; today: string; options: FormOptions; returnTo: string; initial?: OperationData; sourceItems?: (Option & { unit: string })[] };
export function OperationForm(props: OperationFormProps) { return <OperationEditor key={props.id} {...props}/>; }
function OperationEditor({ id, kind, today, options, returnTo, initial = {}, sourceItems = [] }: OperationFormProps) {
  const seed = initial.items;
  const [items,setItems] = useState<(ItemData & {key:string})[]>(()=>(Array.isArray(seed)?seed:kind==="production"?[blank("out"),blank("in")]:[blank()]).map((item,index)=>({...item,key:String(index)})));
  const [fields,setFields] = useState<OperationData>({...initial,date:initial.date || today});
  const field = (key: string) => String(fields[key] ?? "");
  const set = (key: string,value: string) => setFields(current=>({...current,[key]:value}));
  const changeItem = (key:string,changes:Partial<ItemData>) => setItems(current=>current.map(item=>item.key===key?{...item,...changes}:item));
  const stock = ["sale","production","adjustment","sale_return"].includes(kind);
  const money = ["finance","transfer","deposit","purchase_return"].includes(kind);
  const data = {...fields,...(stock?{items:items.map(item=>{const copy={...item};delete (copy as Partial<typeof copy>).key;return copy;})}:{})};
  const total=items.reduce((sum,item)=>sum+(Number(item.quantity)||0)*(Number(item.price)||0),0)-(Number(field("discount"))||0);
  const inputs=items.filter(item=>item.direction==="out").reduce((n,item)=>n+(Number(item.unit==="kg"?item.quantity:item.weight)||0),0);
  const outputs=items.filter(item=>item.direction==="in").reduce((n,item)=>n+(Number(item.unit==="kg"?item.quantity:item.weight)||0),0);
  function number(name:string,label:string,required=false) { return <label>{label}<NumberInput name={`_${name}`} defaultValue={field(name)} required={required} onValueChange={v=>set(name,v)}/></label>; }
  function select(name:string,label:string,choices:Option[],required=false) { return <Dropdown key={`${name}-${id}`} label={label} name={`_${name}`} defaultValue={field(name)} required={required} options={[{value:"",label:`Pilih ${label.toLowerCase()}`},...choices]} onValueChange={v=>set(name,v)}/>; }
  return <form action={saveOperation} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="return_to" value={returnTo}/><input type="hidden" name="data" value={JSON.stringify(data)}/>
    <DatePicker label="Tanggal" name="_date" today={today} defaultValue={field("date")} onValueChange={v=>set("date",v)}/>
    {kind==="sale" && <>{select("partner","Pelanggan",options.partners,true)}<DatePicker label="Jatuh tempo" name="_due" today={today} optional defaultValue={field("due")} onValueChange={v=>set("due",v)}/>{select("assigned","Penagih yang ditugaskan",options.collectors??[])}{select("driver","Sopir yang ditugaskan",options.drivers??[])}</>}
    {stock && <div className="item-list">{items.map((item,index)=>{
      const product=options.products.find(p=>p.id===item.product);
      return <fieldset className="item-editor" key={item.key}><legend>Item {index+1}</legend><div className="item-actions">{items.length>1&&<button type="button" className="icon-button" aria-label={`Hapus item ${index+1}`} onClick={()=>setItems(current=>current.filter(i=>i.key!==item.key))}><Icon name="close" size={16}/></button>}</div>
        {kind==="sale_return" ? <Dropdown label="Item penjualan asal" name={`_source_${index}`} required defaultValue={item.source_item??""} options={[{value:"",label:"Pilih item asal"},...sourceItems]} onValueChange={v=>changeItem(item.key,{source_item:v})}/> : <>
        {(kind==="production"||kind==="adjustment") && <Dropdown label={kind==="production"?"Jenis item":"Arah penyesuaian"} name={`_direction_${index}`} defaultValue={item.direction} options={[{value:"out",label:kind==="production"?"Bahan diproses":"Kurangi stok"},{value:"in",label:kind==="production"?"Hasil aktual":"Tambah stok"}]} onValueChange={v=>changeItem(item.key,{direction:v})}/>}
        <Dropdown label="Produk" name={`_product_${index}`} required defaultValue={item.product} options={[{value:"",label:"Pilih produk"},...options.products.map(p=>({value:p.id,label:p.name}))]} onValueChange={v=>{const next=options.products.find(p=>p.id===v);changeItem(item.key,{product:v,variant:"",unit:next?.product_units[0]?.unit??"kg"});}}/>
        {product?.product_variants.some(v=>v.active) && <Dropdown key={`variant-${item.product}-${item.key}`} label="Varian" name={`_variant_${index}`} defaultValue={item.variant} options={[{value:"",label:"Tanpa varian"},...product.product_variants.filter(v=>v.active).map(v=>({value:v.id,label:v.name}))]} onValueChange={v=>changeItem(item.key,{variant:v})}/>}
        <Dropdown key={`unit-${item.product}-${item.key}`} label="Satuan" name={`_unit_${index}`} defaultValue={item.unit} required options={product?.product_units.map(u=>({value:u.unit,label:u.unit}))??[{value:"kg",label:"kg"}]} onValueChange={v=>changeItem(item.key,{unit:v})}/></>}
        <label>Jumlah{kind==="sale_return"?` (${sourceItems.find(s=>s.value===item.source_item)?.unit??"satuan asal"})`:""}<NumberInput name={`_quantity_${index}`} required defaultValue={item.quantity} onValueChange={v=>changeItem(item.key,{quantity:v})}/></label>
        {kind==="sale"&&<label>Harga satuan (Rp)<NumberInput name={`_price_${index}`} required defaultValue={item.price} onValueChange={v=>changeItem(item.key,{price:v})}/></label>}
        {kind!=="sale_return"&&item.unit!=="kg"&&<label>Berat aktual ditimbang (kg){kind!=="production"&&<span className="optional">opsional</span>}<NumberInput name={`_weight_${index}`} defaultValue={item.weight} required={kind==="production"} onValueChange={v=>changeItem(item.key,{weight:v})}/></label>}
      </fieldset>;
    })}<button type="button" className="button button-secondary" onClick={()=>setItems(current=>[...current,{...blank(kind==="production"?"in":"out"),key:crypto.randomUUID()}])}><Icon name="plus" size={16}/>Tambah item</button></div>}
    {kind==="production" && <p className="calculation">Bahan {formatDecimal(inputs.toFixed(3))} kg · Hasil {formatDecimal(outputs.toFixed(3))} kg · Selisih {formatDecimal((outputs-inputs).toFixed(3))} kg</p>}
    {kind==="sale"&&<>{number("discount","Diskon (Rp)")}<p className="calculation">Total perkiraan Rp{formatDecimal(Math.max(0,total).toFixed(2))}</p>{number("paid","Pembayaran diterima (Rp)")}{select("account","Akun penerimaan",options.paymentAccounts??options.accounts)}</>}
    {kind==="finance"&&select("category","Kategori",options.categories??[],true)}
    {money&&number("amount",kind==="purchase_return"?"Nilai pengurangan tagihan disepakati (Rp)":"Nominal (Rp)",true)}
    {kind==="purchase_return"&&number("quantity","Jumlah dikembalikan (kg)",true)}
    {kind==="deposit" ? <>{select("account","Kas penagih Anda",options.collectorAccounts??[],true)}{select("target","Tujuan setoran",options.accounts,true)}<p className="form-hint">Saldo berpindah setelah diverifikasi oleh orang lain.</p></> : (money||kind==="sale_return")&&<>{select("account",kind.endsWith("return")?"Akun pengembalian dana":"Akun",options.accounts,kind==="finance"||kind==="transfer")}{kind==="transfer"&&select("target","Akun tujuan",options.accounts,true)}</>}
    {kind==="finance"&&field("category")==="fixed_asset"&&<label>Nama aset<input value={field("asset_name")} required maxLength={200} onChange={e=>set("asset_name",e.target.value)}/></label>}
    {kind==="finance"&&field("category")==="asset_sale"&&<>{select("asset","Aset dijual",options.assets??[],true)}{number("book_value","Nilai buku aset saat dijual (Rp)",true)}</>}
    {kind==="finance"&&["loan_received","loan_principal","interest"].includes(field("category"))&&<label>Referensi pinjaman<input value={field("loan_reference")} required maxLength={200} onChange={e=>set("loan_reference",e.target.value)}/><span className="form-hint">Gunakan referensi yang sama untuk pencairan, pokok, dan bunga.</span></label>}
    <label>{["adjustment","sale_return","purchase_return"].includes(kind)?"Alasan":"Keterangan"}<textarea maxLength={1000} value={field("note")} required={["adjustment","sale_return","purchase_return","finance"].includes(kind)} onChange={e=>set("note",e.target.value)}/></label>
    <div className="form-buttons"><SubmitButton name="intent" value="draft" secondary>Simpan draft</SubmitButton><SubmitButton name="intent" value="final">{kind==="deposit"?"Ajukan setoran":"Finalkan transaksi"}</SubmitButton></div>
  </form>;
}
