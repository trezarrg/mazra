"use client";

import { useState } from "react";
import { TransactionChangeFields, type CorrectionContext } from "./transaction-change-fields";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { saveOperation } from "@/app/operasi/actions";
import { formatDecimal } from "@/lib/format";
import { cents, fromCents, multiplyMoney } from "@/lib/money";
import { editMeasurement, changeMeasurementReference } from "@/lib/measurement";
import { MeasurementFields } from "./measurement-fields";
import type { ItemData, OperationData } from "@/lib/operations";
import type { FormOptions } from "./operation-form";

type Props = { id: string; today: string; options: FormOptions; returnTo: string; initial?: OperationData; correction?: CorrectionContext };
const blank = (): ItemData => ({ product: "", variant: "", unit: "kg", quantity: "", price: "", weight: "", direction: "out" });

export function SaleForm(props: Props) { return <Editor key={props.id} {...props}/>; }
function Editor({ id, today, options, returnTo, initial = {}, correction }: Props) {
  const [items, setItems] = useState(() => (Array.isArray(initial.items) ? initial.items : [blank()]).map((item, index) => ({ ...item, key: String(index) })));
  const [fields, setFields] = useState(() => Object.fromEntries(["date", "partner", "driver", "discount", "paid", "account", "due", "note"].map(key => [key, String(initial[key] ?? (key === "date" ? today : key === "paid" ? "0" : ""))])));
  const set = (key: string, value: string) => setFields(current => ({ ...current, [key]: value }));
  const changeItem = (key: string, changes: Partial<ItemData>) => setItems(current => current.map(item => item.key === key ? { ...item, ...changes } : item));
  const subtotals = items.map(item => multiplyMoney(item.price || "0", item.quantity || "0"));
  const gross = subtotals.reduce((sum, amount) => sum + cents(amount), BigInt(0));
  const total = gross - cents(fields.discount || "0");
  const paid = cents(fields.paid || "0");
  const balance = total - paid - cents(correction?.existingPaid||"0");
  const data = { ...fields, paid: fields.paid || "0", account: paid > BigInt(0) ? fields.account : "", due: balance > BigInt(0) ? fields.due : "", items: items.map(({ key, ...item }) => { void key; return item; }) };
  const products = options.products.filter(product => product.product_units.some(unit => unit.unit === "kg"));
  return <form action={saveOperation} className="form sale-form">
    <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value="sale"/><input type="hidden" name="return_to" value={returnTo}/><input type="hidden" name="data" value={JSON.stringify(data)}/>
    <DatePicker label="Tanggal" name="_date" today={today} defaultValue={fields.date} onValueChange={value => set("date", value)}/>
    <Dropdown label="Pelanggan" name="_partner" required defaultValue={fields.partner} options={[{ value: "", label: "Pilih pelanggan" }, ...options.partners]} onValueChange={value => set("partner", value)}/>
    {!!options.drivers?.length && <Dropdown label="Sopir yang ditugaskan" name="_driver" defaultValue={fields.driver} options={[{ value: "", label: "Tanpa penugasan" }, ...options.drivers]} onValueChange={value => set("driver", value)}/>}
    <div className="sale-items">
      <div className="sale-items-heading" aria-hidden="true"><span>Produk</span><span>Jumlah</span><span>Satuan</span><span>Harga satuan (Rp)</span><span>Subtotal</span><span/></div>
      {items.map((item, index) => {
        const product = products.find(product => product.id === item.product);
        return <fieldset className="sale-item" key={item.key}>
          <legend className="sr-only">Item {index + 1}</legend>
          <div className="sale-item-product"><Dropdown label={`Produk item ${index + 1}`} name={`_product_${index}`} required defaultValue={item.product} options={[{ value: "", label: "Pilih produk" }, ...products.map(product => ({ value: product.id, label: product.name }))]} onValueChange={value => changeItem(item.key, { product: value, variant: "", unit: "kg", quantity:"",weight: "",count:"",weight_source:"measured",count_source:"",stock_reference:"",measurement_ratio:"",count_unit:products.find(p=>p.id===value)?.count_unit??undefined,estimate_confirmed:"" })}/></div>
          <label className="sale-item-quantity"><span className="sale-field-label">Jumlah</span><NumberInput name={`_quantity_${index}`} value={item.quantity} required onValueChange={value => changeItem(item.key, editMeasurement(item,item.unit==="kg"?"weight":"count",value,product))}/></label>
          <div className="sale-item-unit"><Dropdown key={`${item.key}-${item.product}`} label="Satuan" name={`_unit_${index}`} required defaultValue={item.unit} options={product?.product_units.filter(u=>u.unit==="kg"||!product.count_unit||u.unit===product.count_unit).map(unit => ({ value: unit.unit, label: unit.unit })) ?? [{ value: "kg", label: "kg" }]} onValueChange={value => changeItem(item.key, { unit: value,quantity:"",weight:"",count:"",weight_source:"measured",count_source:"",estimate_confirmed:"" })}/></div>
          <label className="sale-item-price"><span className="sale-field-label">Harga satuan (Rp)</span><NumberInput name={`_price_${index}`} defaultValue={item.price} required onValueChange={value => changeItem(item.key, { price: value })}/></label>
          <span className="sale-item-subtotal"><span className="sale-mobile-label">Subtotal </span>Rp{formatDecimal(subtotals[index])}</span>
          {items.length > 1 ? <button type="button" className="icon-button sale-item-remove" aria-label={`Hapus item ${index + 1}`} onClick={() => setItems(current => current.filter(row => row.key !== item.key))}><Icon name="close" size={16}/></button> : <span className="sale-item-remove" aria-hidden="true"/>}
          {product?.product_variants.some(variant => variant.active) && <div className="sale-item-extra"><Dropdown key={`${item.key}-${item.product}-variant`} label="Varian" name={`_variant_${index}`} defaultValue={item.variant} options={[{ value: "", label: "Tanpa varian" }, ...product.product_variants.filter(variant => variant.active).map(variant => ({ value: variant.id, label: variant.name }))]} onValueChange={value => changeItem(item.key, changeMeasurementReference({...item,variant:value},"",product))}/></div>}
          <div className="sale-item-extra"><MeasurementFields key={`${item.product}-${item.variant}-${item.unit}`} item={item} product={product} prefix={`_sale_${index}`} onChange={next=>changeItem(item.key,next)}/></div>
        </fieldset>;
      })}
      <button type="button" className="button button-secondary sale-add-item" onClick={() => setItems(current => [...current, { ...blank(), key: crypto.randomUUID() }])}><Icon name="plus" size={16}/>Tambah item</button>
    </div>
    <label>Diskon (Rp)<NumberInput name="_discount" defaultValue={fields.discount} onValueChange={value => set("discount", value)}/></label>
    <div className="calculation">Total Rp{formatDecimal(fromCents(total > BigInt(0) ? total : BigInt(0)))}<br/>Sisa pembayaran Rp{formatDecimal(fromCents(balance > BigInt(0) ? balance : BigInt(0)))}</div>
    {!correction&&<>
    <label>Pembayaran awal (Rp)<NumberInput name="_paid" defaultValue={fields.paid} onValueChange={value => set("paid", value)}/></label>
    <p className="caption">Boleh Rp0. Penjualan dapat diterbitkan sebelum pembayaran. Invoice, Surat Jalan, atau Struk Thermal 58 mm dipilih dari rincian transaksi.</p>
    {paid > BigInt(0) && <Dropdown label="Akun penerimaan" name="_account" required defaultValue={fields.account} options={[{ value: "", label: "Pilih akun penerimaan" }, ...options.accounts]} onValueChange={value => set("account", value)}/>}
    </>}
    {balance > BigInt(0) && <DatePicker key={`due-${balance > BigInt(0)}`} label="Jatuh tempo" name="_due" today={today} optional defaultValue={fields.due} onValueChange={value => set("due", value)}/>}
    {total < BigInt(0) && <p className="filter-error" role="alert">Diskon melebihi total item.</p>}
    {paid > total && paid > BigInt(0) && <p className="filter-error" role="alert">Pembayaran awal melebihi total invoice.</p>}
    <label>Keterangan<span className="optional">opsional</span><textarea maxLength={1000} value={fields.note} onChange={event => set("note", event.target.value)}/></label>
    {correction&&<TransactionChangeFields correction={correction}/>}
    <div className="form-buttons">{!correction&&<SubmitButton name="intent" value="draft" secondary>Simpan draft</SubmitButton>}<SubmitButton name="intent" value="final">{correction?"Simpan perbaikan":"Terbitkan penjualan"}</SubmitButton></div>
  </form>;
}
