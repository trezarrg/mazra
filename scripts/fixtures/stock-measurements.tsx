"use client";
import {OperationForm} from "../../src/components/operation-form";
import {ProcessingForm} from "../../src/components/processing-form";
import {ReceiptMeasurementFields} from "../../src/components/receipt-measurement-fields";
import {DeliveryForm} from "../../src/components/transaction-forms";
import type {Product,Item} from "../../src/lib/operations";

const reference={id:"11111111-1111-4111-8111-111111111111",product_id:"live",variant_id:"small",movement_date:"2026-11-09",source_type:"purchase_receipt",quantity:"150",count_delta:"100",count_unit:"ekor",measured_ratio:"1.5",reference_balance:"150",shelf_life_days:null};
const live:Product={id:"live",name:"Ayam hidup",count_unit:"ekor",kg_per_count:"2",allow_estimates:true,product_units:[{unit:"kg"},{unit:"ekor"}],product_variants:[{id:"small",name:"Kecil",active:true,kg_per_count:"1.2"},{id:"large",name:"Besar",active:true,kg_per_count:"2.5"}],references:[reference]};
const carcass:Product={id:"carcass",name:"Karkas",count_unit:"ekor",kg_per_count:"1.1",allow_estimates:true,product_units:[{unit:"kg"},{unit:"ekor"}],product_variants:[]};
const options={products:[live,carcass],partners:[{value:"customer",label:"Pelanggan contoh"}],accounts:[]};

export function StockMeasurementsFixture({mode}:{mode:string}) {
  if(mode==="receipt")return <form className="form" onSubmit={e=>e.preventDefault()}><ReceiptMeasurementFields product={live} variant="small" defaultWeight="1000"/></form>;
  if(mode==="processing")return <ProcessingForm id="fixture-measured-process" today="2026-11-09" returnTo="/produksi" choices={[{key:"live:small",product:"live",variant:"small",label:"Ayam hidup · Kecil",balance:"150",measurement:live},{key:"carcass:",product:"carcass",variant:"",label:"Karkas",balance:"0",measurement:carcass}]}/>;
  if(mode==="delivery") {
    const item:Item={id:"line",product_id:"carcass",variant_id:null,unit:"kg",quantity:"14",price:"40000",actual_weight:null,piece_count:"10",count_unit:"ekor",weight_source:"measured",count_source:"counted",measurement_ratio:"1.4",direction:"out",products:{name:"Karkas"},product_variants:null};
    return <DeliveryForm id="fixture-measured-delivery" saleId="sale" today="2026-11-09" items={[item]} returnTo="/penjualan"/>;
  }
  if(mode==="sale")return <OperationForm id="fixture-measured-sale" kind="sale" today="2026-11-09" options={options} initial={{partner:"customer"}} returnTo="/penjualan"/>;
  return <OperationForm id="fixture-measured-loss" kind="adjustment" today="2026-11-09" options={options} initial={{stock_event:"loss",loss_reason:"housing_death",location:"Kandang",note:"Ayam mati saat diperiksa",items:[{product:"live",variant:"small",unit:"kg",direction:"out",quantity:"",weight:"",count:"",price:""}]}} returnTo="/stok"/>;
}
