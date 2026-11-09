export type WeightSource = "measured" | "supplier" | "estimated" | "unknown";
export type CountSource = "counted" | "supplier" | "estimated";
export type Measurement = {
  weight_source?: WeightSource; count_source?: CountSource | "";
  count_unit?: string; measurement_ratio?: string; ratio_source?: string;
  stock_reference?: string; estimate_confirmed?: string;
};
export type StockReference = {
  id:string; product_id:string; variant_id:string|null; movement_date:string; source_type:string;
  quantity:string; count_delta:string|null; count_unit:string|null; measured_ratio:string|null;
  reference_balance:string|null; shelf_life_days:number|null;
};
export type MeasurementProduct = {
  count_unit?:string|null; kg_per_count?:string|null; allow_estimates?:boolean; shelf_life_days?:number|null;
  product_variants?: {id:string;kg_per_count?:string|null}[]; references?:StockReference[];
};

function scaled(value:string, precision:number):bigint|null {
  const raw=String(value);
  if(!/^\d+(?:\.\d+)?$/.test(raw))return null;
  const [whole,fraction=""]=raw.split(".");
  if(fraction.length>precision && /[1-9]/.test(fraction.slice(precision)))return null;
  return BigInt(whole)*BigInt(10)**BigInt(precision)+BigInt(fraction.slice(0,precision).padEnd(precision,"0"));
}
function decimal(value:bigint,precision:number) {
  const digits=value.toString().padStart(precision+1,"0");
  return `${digits.slice(0,-precision)}.${digits.slice(-precision)}`;
}
export function estimatedWeight(count:string,ratio:string) {
  const n=scaled(count,0),r=scaled(ratio,6);
  return n!==null && n>BigInt(0) && r!==null && r>BigInt(0) ? decimal((n*r+BigInt(500))/BigInt(1000),3) : "";
}
export function estimatedCount(weight:string,ratio:string) {
  const kg=scaled(weight,3),r=scaled(ratio,6);
  if(kg===null || r===null || kg<=BigInt(0) || r<=BigInt(0))return "";
  const n=(kg*BigInt(1000)+r/BigInt(2))/r;
  return n>BigInt(0) ? n.toString() : "";
}
export function pairedRatio(weight:string,count:string) {
  const kg=scaled(weight,3),n=scaled(count,0);
  return kg!==null && kg>BigInt(0) && n!==null && n>BigInt(0) ? decimal((kg*BigInt(1000)+n/BigInt(2))/n,6) : "";
}
export function measurementPolicy(product:MeasurementProduct|undefined,variant="",reference="") {
  const group=product?.references?.find(r=>r.id===reference && (r.variant_id??"")===variant && r.count_unit===product?.count_unit);
  const specific=product?.product_variants?.find(v=>v.id===variant)?.kg_per_count;
  return {ratio:String(group?.measured_ratio??specific??product?.kg_per_count??""),source:group?.measured_ratio?"reference":specific?"variant":"product",unit:product?.count_unit??"pcs",allowed:product?.allow_estimates!==false};
}
export type MeasuredItem = Measurement & {unit:string;quantity:string;weight:string;count?:string;variant?:string};
export function measurementMetadata(item:Measurement):Measurement {
  return {weight_source:item.weight_source,count_source:item.count_source,count_unit:item.count_unit,measurement_ratio:item.measurement_ratio,ratio_source:item.ratio_source,stock_reference:item.stock_reference,estimate_confirmed:item.estimate_confirmed};
}
export function editMeasurement<T extends MeasuredItem>(item:T,field:"weight"|"count",value:string,product?:MeasurementProduct):T {
  const policy=measurementPolicy(product,item.variant,item.stock_reference);
  if(item.stock_reference && item.ratio_source==="reference" && item.measurement_ratio && !product?.references?.some(r=>r.id===item.stock_reference)) {policy.ratio=String(item.measurement_ratio);policy.source="reference";}
  let weight=item.unit==="kg"?item.quantity:item.weight, count=item.unit==="kg"?(item.count??""):item.quantity;
  let ws=item.weight_source??"measured",cs=item.count_source??(count?"counted":"");
  if(field==="weight") {weight=value;ws="measured";}
  else {count=value;cs=value?"counted":"";}
  if(policy.allowed && policy.ratio) {
    if(field==="count" && count && (!weight || ws==="estimated")) {weight=estimatedWeight(count,policy.ratio);ws=weight?"estimated":"measured";}
    else if(field==="weight" && weight && (!count || cs==="estimated")) {count=estimatedCount(weight,policy.ratio);cs=count?"estimated":"";}
  }
  if(field==="count" && !count && ws==="estimated") {weight="";ws="measured";}
  if(field==="weight" && !weight && cs==="estimated") {count="";cs="";}
  const estimated=ws==="estimated"||cs==="estimated";
  return {...item,quantity:item.unit==="kg"?weight:count,weight:item.unit==="kg"?"":weight,count,
    weight_source:ws,count_source:cs,count_unit:product?.count_unit??item.count_unit??(item.unit!=="kg"?item.unit:policy.unit),
    measurement_ratio:estimated?policy.ratio:pairedRatio(weight,count),ratio_source:estimated?policy.source:"paired",estimate_confirmed:""};
}
export function changeMeasurementReference<T extends MeasuredItem>(item:T,reference:string,product?:MeasurementProduct):T {
  const next={...item,stock_reference:reference,estimate_confirmed:""};
  const policy=measurementPolicy(product,item.variant,reference);
  const weight=item.unit==="kg"?item.quantity:item.weight, count=item.unit==="kg"?(item.count??""):item.quantity;
  if(item.weight_source==="estimated") {
    if(!policy.allowed||!policy.ratio)return {...next,quantity:item.unit==="kg"?"":item.quantity,weight:"",weight_source:"measured",measurement_ratio:"",ratio_source:""};
    return {...editMeasurement(next,"count",count,product),count_source:item.count_source};
  }
  if(item.count_source==="estimated") {
    if(!policy.allowed||!policy.ratio)return {...next,quantity:item.unit==="kg"?item.quantity:"",count:"",count_source:"",measurement_ratio:"",ratio_source:""};
    return {...editMeasurement(next,"weight",weight,product),weight_source:item.weight_source};
  }
  return {...next,estimate_confirmed:""};
}
export function countDescription(value:string|null|undefined,unit:string|null|undefined,status:string|undefined) {
  if(value==null || status==="incomplete")return "Jumlah belum lengkap";
  return `${status==="estimated"?"± ":""}${value} ${unit??"pcs"}`;
}
