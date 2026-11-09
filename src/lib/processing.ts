import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeasurementProduct,StockReference } from "./measurement";

export type StockChoice = { key: string; product: string; variant: string; label: string; balance: string; measurement?:MeasurementProduct };
export type ProcessingSummary = {
  process_count: number; input_weight: string; output_weight: string; piece_count: string | null;
  count_unit?:string|null;count_status?:string;
  outputs: { product_id: string; variant_id: string | null; name: string; weight: string; piece_count: string | null;count_unit?:string|null;count_status?:string }[];
  purchases?: string; sales?: string;
};

export async function getProcessingOptions(db: SupabaseClient) {
  const [result,products,references]=await Promise.all([db.rpc("processing_options"),db.from("products").select("id,count_unit,kg_per_count,allow_estimates,product_variants(id,kg_per_count)"),db.from("stock_reference_options").select("*").order("movement_date",{ascending:false}).order("id").limit(300)]);
  return { choices: ((result.data ?? []) as StockChoice[]).map(c=>({...c,measurement:{...products.data?.find(p=>p.id===c.product),references:((references.data??[]) as StockReference[]).filter(r=>r.product_id===c.product)}})), error: !!result.error||!!products.error||!!references.error };
}
