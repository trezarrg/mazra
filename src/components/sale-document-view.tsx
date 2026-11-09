"use client";
import { useState } from "react";
import { saleDocumentFormats, saleDocumentNumber, type SaleDocumentData, type SaleDocumentFormat } from "@/lib/sale-document";
import { Dropdown } from "./dropdown";
import { DocumentView } from "./document-view";
import { SaleDocumentPaper } from "./sale-document-paper";

export function SaleDocumentView({data}:{data:SaleDocumentData}) {
  const [format,setFormat]=useState<SaleDocumentFormat>("invoice");
  const title=saleDocumentFormats.find(option=>option.value===format)!.label;
  return <div className={format === "thermal" ? "sale-document is-thermal" : "sale-document"}>
    <div className="sale-document-options"><Dropdown label="Format dokumen" name="document_format" defaultValue={format} options={[...saleDocumentFormats]} onValueChange={value=>{if(saleDocumentFormats.some(option=>option.value===value))setFormat(value as SaleDocumentFormat);}}/></div>
    <DocumentView key={format} number={saleDocumentNumber(data.number,format)} title={title} thermal={format==="thermal"} content={<SaleDocumentPaper data={data} format={format}/>}/>
    {format==="thermal" && <p className="caption thermal-print-hint">Pilih printer dengan kertas 58 mm, skala 100%, serta matikan header dan footer pada pengaturan cetak.</p>}
  </div>;
}
