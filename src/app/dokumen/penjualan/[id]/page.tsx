import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { businessLogoUrl } from "@/lib/business-branding";
import { officeRoles, type Operation, type Obligation } from "@/lib/operations";
import { saleDocumentTotals, type SaleDocumentData } from "@/lib/sale-document";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/ui";
import { SaleDocumentView } from "@/components/sale-document-view";

export default async function SaleDocument({params}:{params:Promise<{id:string}>}) {
  const {db,role,roles}=await requireAccess(officeRoles);
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
  const result=await db.from("operation_details").select("*").eq("id",id).eq("kind","sale").maybeSingle();
  const failed=(message:string)=><AppShell title="Dokumen penjualan" active="sale" role={role} roles={roles}><Notice error>{message}</Notice></AppShell>;
  if(result.error)return failed("Dokumen penjualan belum dapat dimuat. Silakan muat ulang halaman.");
  if(!result.data)notFound();
  const sale=result.data as Operation;
  if(sale.status!=="final" || !sale.partner_id)return failed("Dokumen cetak tersedia setelah penjualan diterbitkan.");
  const [items,billResult,settings,customer]=await Promise.all([
    db.from("item_details").select("*").eq("operation_id",id).eq("direction","out").order("id"),
    db.from("obligations").select("*").eq("source_id",id).eq("kind","receivable").maybeSingle(),
    db.from("business_settings").select("name,address,phone,logo_path").eq("id",true).single(),
    db.from("partners").select("name,address,phone").eq("id",sale.partner_id).single(),
  ]);
  if([items,billResult,settings,customer].some(r=>r.error) || !items.data?.length || !settings.data || !customer.data || (!billResult.data && !sale.reversed_by))return failed("Rincian dokumen belum dapat dimuat lengkap. Muat ulang halaman sebelum mencetak atau membagikan.");
  const bill=billResult.data as Obligation|null;
  const document:SaleDocumentData={
    id,number:sale.document_no,date:sale.operation_date,
    business:{...settings.data,logo:businessLogoUrl(settings.data.logo_path)},customer:customer.data,
    items:items.data.map(item=>({id:item.id,name:item.product_name,variant:item.variant_name,quantity:item.quantity,unit:item.unit,price:item.price,weight:item.actual_weight,pieces:item.piece_count,weight_source:item.weight_source,count_source:item.count_source,count_unit:item.count_unit})),
    total:sale.amount,discount:sale.discount,paid:bill?.paid??"0",credited:bill?.credited??"0",balance:bill?.balance??"0",
    dueDate:bill?.due_date??sale.due_date,note:sale.note,cancelled:!!sale.reversed_by,
  };
  try {saleDocumentTotals(document);} catch {return failed("Rincian item belum sesuai dengan total penjualan. Periksa transaksi sebelum mencetak.");}
  return <AppShell title="Dokumen penjualan" active="sale" role={role} roles={roles}><div className="purchase-document">
    <div className="purchase-document-back"><Link className="text-link" href={`/dokumen/${id}`}>Kembali ke rincian penjualan</Link></div>
    {sale.reversed_by && <Notice>Penjualan ini sudah dibatalkan. Dokumen hanya untuk arsip.</Notice>}
    <SaleDocumentView key={JSON.stringify(document)} data={document}/>
  </div></AppShell>;
}
