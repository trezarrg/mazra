import { SaleDocumentView } from "../../src/components/sale-document-view";
import type { SaleDocumentData } from "../../src/lib/sale-document";

const data:SaleDocumentData={
  id:"4455749a-c720-406b-ae20-0a464f4f0bcd",number:42,date:"2026-11-09",
  business:{name:"Usaha Ayam Potong Contoh",address:"Jalan Contoh Nomor 10",phone:"021000000",logo:"/Logo.png"},
  customer:{name:"Pelanggan Contoh",address:"Alamat pelanggan untuk pengiriman",phone:"081200000000"},
  items:[{id:"a",name:"Karkas ayam segar",variant:"Ukuran sedang",quantity:"12.345",unit:"kg",price:"32500.00",weight:null,pieces:null},{id:"b",name:"Ayam utuh dengan nama produk panjang untuk memeriksa lebar cetak thermal",variant:null,quantity:"3.000",unit:"ekor",price:"65000.00",weight:"6.125",pieces:"3"}],
  total:"591212.50",discount:"5000.00",paid:"100000.00",credited:"50000.00",balance:"441212.50",dueDate:"2026-11-15",note:"Kirim ke pintu samping pelanggan.",cancelled:false,
};
export function SaleDocumentFixture({cancelled=false}:{cancelled?:boolean}) {
  return <div className="purchase-document"><SaleDocumentView key={String(cancelled)} data={{...data,cancelled}}/></div>;
}
