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
import type { ItemData, OperationData } from "@/lib/operations";
import type { StockChoice } from "@/lib/processing";
import { editMeasurement,measurementMetadata,type Measurement } from "@/lib/measurement";
import { MeasurementFields } from "./measurement-fields";

type Props = { id: string; today: string; choices: StockChoice[]; returnTo: string; initial?: OperationData; correction?: CorrectionContext };
type Result = Measurement & { key: string; choice: string; quantity: string; count: string };

export function ProcessingForm(props: Props) { return <Editor key={props.id} {...props}/>; }
function Editor({ id, today, choices, returnTo, initial = {}, correction }: Props) {
  const seed = Array.isArray(initial.items) ? initial.items : [];
  const input = seed.find(item => item.direction === "out");
  const preferred = choices.find(item => /hidup/i.test(item.label)) ?? choices.find(item => Number(item.balance) > 0);
  const [source, setSource] = useState(input ? `${input.product}:${input.variant}` : preferred?.key ?? "");
  const [inputMeasure,setInputMeasure]=useState<ItemData>(()=>input??{product:"",variant:"",unit:"kg",quantity:"",count:"",price:"",weight:"",direction:"out"});
  const weight=inputMeasure.quantity, count=inputMeasure.count??"";
  const [date, setDate] = useState(String(initial.date ?? today));
  const [note, setNote] = useState(String(initial.note ?? ""));
  const [showCounts, setShowCounts] = useState(() => seed.some(item => item.direction === "in" && !!item.count));
  const [outputs, setOutputs] = useState<Result[]>(() => {
    const results = seed.filter(item => item.direction === "in").map((item, index) => ({...item, key: String(index), choice: `${item.product}:${item.variant}`, quantity: item.quantity, count: item.count ?? "" }));
    return results.length ? results : [{ key: "0", choice: "", quantity: "", count: "" }];
  });
  const selected = choices.find(item => item.key === source);
  const material = (key: string, quantity: string, pieces: string, direction: string,metadata:Measurement={}): ItemData => {
    const choice = choices.find(item => item.key === key);
    return {...measurementMetadata(metadata), product: choice?.product ?? "", variant: choice?.variant ?? "", unit: "kg", quantity, count: pieces, price: "", weight: "", direction };
  };
  const data = { date, note, items: [material(source, weight, count, "out",inputMeasure), ...outputs.map(item => material(item.choice, item.quantity, item.count, "in",item))] };
  const total = outputs.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const difference = (Number(weight) || 0) - total;
  function change(key: string, next: Partial<Result>) { setOutputs(current => current.map(item => item.key === key ? { ...item, ...next } : item)); }
  const options = choices.map(item => ({ value: item.key, label: item.label }));
  return <form action={saveOperation} className="form">
    <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value="production"/><input type="hidden" name="return_to" value={returnTo}/><input type="hidden" name="data" value={JSON.stringify(data)}/>
    <DatePicker label="Tanggal" name="_date" today={today} defaultValue={date} onValueChange={setDate}/>
    <Dropdown label="Bahan yang diolah" name="_source" required defaultValue={source} options={[{ value: "", label: "Pilih bahan" }, ...options]} onValueChange={value => { setSource(value);setInputMeasure(material(value,"","","out")); setOutputs(current => current.map(item => item.choice === value ? { ...item, choice: "" } : item)); }}/>
    {selected && <p className="caption">Stok tersedia {formatDecimal(selected.balance)} kg{correction?' setelah catatan lama dibatalkan.':''}</p>}
    <label>Berat yang diolah (kg)<NumberInput name="_weight" value={weight} required onValueChange={value=>setInputMeasure(current=>editMeasurement(material(source,current.quantity,current.count??"","out",current),"weight",value,selected?.measurement))}/></label>
    <MeasurementFields key={source} item={material(source,weight,count,"out",inputMeasure)} product={selected?.measurement} prefix="_input" onChange={setInputMeasure}/>
    <div className="processing-results">
      <div className="processing-results-heading"><strong>Hasil olahan</strong><button type="button" className="text-link processing-count-toggle" aria-expanded={showCounts} onClick={() => setShowCounts(visible => !visible)}>{showCounts ? "Sembunyikan ekor/pcs" : outputs.some(item => item.count) ? "Ekor/pcs (terisi)" : "Tambah ekor/pcs"}</button></div>
      <div className="processing-results-columns" aria-hidden="true"><span>Produk</span><span>Berat (kg)</span><span/></div>
      <div className="processing-results-list">{outputs.map((item, index) => <fieldset className="processing-result-row" key={item.key}>
        <legend className="sr-only">Hasil {index + 1}</legend>
        <Dropdown key={`product-${item.key}-${source}`} label={`Produk hasil ${index + 1}`} name={`_product_${item.key}`} required defaultValue={item.choice} options={[{ value: "", label: "Pilih hasil" }, ...options.filter(option => option.value !== source)]} onValueChange={choice => change(item.key, { choice,count:"",count_source:"",weight_source:"measured",measurement_ratio:"",stock_reference:"",estimate_confirmed:"" })}/>
        <label className="processing-result-weight"><span className="sr-only">Berat hasil {index + 1} (kg)</span><NumberInput name={`_quantity_${item.key}`} value={item.quantity} placeholder="0" required onValueChange={quantity => {const next=editMeasurement(material(item.choice,item.quantity,item.count,"in",item),"weight",quantity,choices.find(c=>c.key===item.choice)?.measurement);change(item.key,{...next,count:next.count??""});}}/></label>
        {outputs.length > 1 ? <button type="button" className="icon-button processing-remove-result" aria-label={`Hapus hasil ${index + 1}`} onClick={() => setOutputs(current => current.filter(result => result.key !== item.key))}><Icon name="close" size={16}/></button> : <span aria-hidden="true"/>}
        {(showCounts||item.count_source==="estimated"||item.weight_source==="estimated") && <div className="processing-result-count"><MeasurementFields key={item.choice} item={material(item.choice,item.quantity,item.count,"in",item)} product={choices.find(c=>c.key===item.choice)?.measurement} prefix={`_pieces_${item.key}`} reference={false} onChange={next=>change(item.key,{...next,count:next.count??""})}/></div>}
      </fieldset>)}</div>
      <button type="button" className="button button-secondary processing-add-result" onClick={() => setOutputs(current => [...current, { key: crypto.randomUUID(), choice: "", quantity: "", count: "" }])}><Icon name="plus" size={16}/>Tambah hasil</button>
      <details className="processing-results-help"><summary>Bagaimana mencatat hasil?</summary><p>Karkas adalah ayam yang sudah disembelih dan dibersihkan, sebelum dibagi menjadi bagian-bagian.</p><p>Catat barang yang tersedia. Contoh: jika hasilnya 7 kg karkas dan 3 kg fillet, isi 7 kg dan 3 kg. Jangan hitung fillet itu lagi sebagai bagian dari karkas.</p></details>
    </div>
    <div className="calculation" role="status" aria-atomic="true">Diolah {formatDecimal(weight || "0")} kg · Hasil {formatDecimal(total.toFixed(3))} kg<br/>Selisih proses {formatDecimal(difference.toFixed(3))} kg · Perolehan {formatDecimal((Number(weight) > 0 ? total / Number(weight) * 100 : 0).toFixed(2))}%</div>
    {difference < -0.0005 && <p className="filter-error" role="alert">Total berat hasil tidak boleh melebihi berat bahan.</p>}
    <label>Catatan<span className="optional">opsional</span><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/></label>
    {correction&&<TransactionChangeFields correction={correction}/>}
    <div className="form-buttons">{!correction&&<SubmitButton name="intent" value="draft" secondary>Simpan draft</SubmitButton>}<SubmitButton name="intent" value="final">{correction?"Simpan perbaikan":"Simpan hasil potong"}</SubmitButton></div>
  </form>;
}
