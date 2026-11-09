"use client";
import type { ReactNode } from "react";
import type { PurchaseDocumentData } from "@/lib/purchase-document";
import { DocumentView } from "./document-view";
import { PurchaseDocumentPaper } from "./purchase-document-paper";

export function PurchaseDocumentView({ data, actions }: { data: PurchaseDocumentData; actions?:ReactNode }) {
  return <DocumentView number={data.number} title="Bukti pembelian" content={<PurchaseDocumentPaper data={data}/>} actions={actions}/>;
}
