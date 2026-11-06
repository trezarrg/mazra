import Link from "next/link";
import { randomUUID } from "node:crypto";
import { changeTransaction } from "@/app/operasi/actions";
import { formatDate,formatDecimal } from "@/lib/format";
import type { Operation,Option } from "@/lib/operations";
import type { StockChoice } from "@/lib/processing";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { SubmitButton } from "./submit-button";
import { Sheet } from "./sheet";
import { CorrectionForm } from "./correction-form";
import { OperationForm,type FormOptions } from "./operation-form";
import { ProcessingForm } from "./processing-form";
import { HRForm } from "@/app/sdm/forms";

export function MetadataForm({kind,source,today,note,due,driver,drivers,returnTo}:{kind:"operation"|"receipt";source:string;today:string;note:string|null;due?:string|null;driver?:string|null;drivers?:Option[];returnTo:string}) {
 return <form action={changeTransaction} className="form"><input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="source_kind" value={kind}/><input type="hidden" name="source" value={source}/><input type="hidden" name="action" value="metadata"/><input type="hidden" name="return_to" value={returnTo}/><label>Keterangan<textarea name="note" defaultValue={note??""} maxLength={1000}/></label>{due!==undefined&&<DatePicker label="Jatuh tempo" name="due" today={today} defaultValue={due??""} optional/>}{drivers&&<Dropdown label="Sopir" name="driver" defaultValue={driver??""} options={[{value:"",label:"Tanpa penugasan"},...drivers]}/>}
 <label>Alasan perubahan<textarea name="reason" required maxLength={1000}/></label><SubmitButton>Simpan keterangan</SubmitButton></form>;
}
export function TransactionTools({doc,today,options,choices,sourceItems,employees,paid="0"}:{doc:Operation;today:string;options:FormOptions;choices:StockChoice[];sourceItems:(Option&{unit:string})[];employees:Option[];paid?:string}) {
 const path=`/dokumen/${doc.id}`;
 const correction={source:doc.id,originalAmount:doc.amount,existingPaid:paid};
 const restoredChoices=choices.map(choice=>({...choice,balance:Math.max(0,Number(choice.balance)+(Array.isArray(doc.payload.items)?doc.payload.items.filter(i=>i.product===choice.product&&(i.variant??'')===choice.variant).reduce((n,i)=>n+(i.direction==='out'?1:-1)*Number(i.quantity),0):0)).toFixed(3)}));
 const initial={...doc.payload,date:doc.operation_date,note:doc.note??"",...(doc.kind==="sale"?{paid:"0",due:doc.due_date??"",driver:doc.driver_id??""}:{})};
 return <details className="transaction-menu"><summary aria-label="Kelola transaksi">Kelola</summary><div className="transaction-menu-actions">
  <Sheet title="Edit keterangan" trigger="Edit keterangan" className="button button-secondary"><MetadataForm kind="operation" source={doc.id} today={today} note={doc.note} due={doc.kind==="sale"?doc.due_date:undefined} driver={doc.driver_id} drivers={doc.kind==="sale"?options.drivers:undefined} returnTo={path}/></Sheet>
  <Sheet title="Perbaiki transaksi" trigger="Perbaiki transaksi" className="button button-secondary" wide={doc.kind==="sale"}>
   {doc.kind==="production"?<ProcessingForm id={randomUUID()} today={today} initial={initial} choices={restoredChoices} returnTo={path} correction={correction}/>:['payroll','advance','advance_repayment'].includes(doc.kind)?<HRForm id={randomUUID()} kind={doc.kind} today={today} employees={employees} accounts={options.accounts} initial={initial as Record<string,string>} returnTo={path} correction={correction}/>:<OperationForm id={randomUUID()} kind={doc.kind} today={today} initial={initial} options={options} returnTo={path} sourceItems={sourceItems} correction={correction}/>}
  </Sheet>
  <Sheet title="Batalkan transaksi" trigger="Batalkan transaksi" className="button button-secondary"><CorrectionForm source={doc.id} kind="operation" today={today} sourceDate={doc.operation_date} returnTo={path}/></Sheet>
 </div></details>;
}

function SnapshotItems({items}:{items:unknown}) {
 if(!Array.isArray(items))return null;
 return <ul>{items.map((item,index)=><li key={index}>{String(item.product_name??"Produk")}{item.variant_name?" - "+String(item.variant_name):""}: {formatDecimal(String(item.quantity))} {String(item.unit)}{Number(item.price)>0?" - Rp"+formatDecimal(String(item.price))+" / "+String(item.unit):""}</li>)}</ul>;
}
export type ChangeRecord={id:string;source_kind:string;action:string;source_id:string;replacement_id:string|null;reason:string;created_at:string;before_data:Record<string,unknown>;after_data:Record<string,unknown>};
export function TransactionHistory({rows}:{rows:ChangeRecord[]}) {
 return rows.length?<details className="form-details"><summary>Riwayat perubahan ({rows.length})</summary><div className="transaction-history">{rows.map(row=><article key={row.id}><strong>{row.action==="cancel"?"Dibatalkan":row.action==="metadata"?"Keterangan diubah":"Transaksi diperbaiki"}</strong><small>{new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.created_at))}</small><p>{row.reason}</p><dl>{[['amount','Nominal'],['bill_amount','Tagihan'],['unit_price','Harga satuan'],['actual_weight','Berat aktual (kg)'],['billing_quantity','Dasar tagihan'],['note','Catatan'],['due_date','Jatuh tempo']].filter(([key])=>JSON.stringify(row.before_data[key])!==JSON.stringify(row.after_data[key])).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{[row.before_data[key],row.after_data[key]].map((value,index)=><span key={index}>{index===1?' → ':''}{value==null||value===''?'—':key==='due_date'?formatDate(String(value)):['note'].includes(key)?String(value):`${['amount','bill_amount','unit_price'].includes(key)?'Rp':''}${formatDecimal(String(value))}`}</span>)}</dd></div>)}</dl>{row.action==="replace"&&Array.isArray(row.before_data.items)&&<details className="form-details"><summary>Rincian item sebelum / sesudah</summary><strong>Sebelum</strong><SnapshotItems items={row.before_data.items}/><strong>Sesudah</strong><SnapshotItems items={row.after_data.items}/></details>}{row.replacement_id&&<Link className="text-link" href={row.source_kind==='payment'?(row.after_data.kind==='payable'?`/dokumen/pembelian/${row.after_data.source_id}`:`/dokumen/${row.after_data.source_id}`):row.source_kind==='receipt'?`/dokumen/pembelian/${row.replacement_id}`:`/dokumen/${row.replacement_id}`}>Lihat transaksi pengganti</Link>}</article>)}</div></details>:null;
}
