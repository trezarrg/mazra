import type { SupabaseClient } from "@supabase/supabase-js";

export type StockChoice = { key: string; product: string; variant: string; label: string; balance: string };
export type ProcessingSummary = {
  process_count: number; input_weight: string; output_weight: string; piece_count: string | null;
  outputs: { product_id: string; variant_id: string | null; name: string; weight: string; piece_count: string | null }[];
  purchases?: string; sales?: string;
};

export async function getProcessingOptions(db: SupabaseClient) {
  const result = await db.rpc("processing_options");
  return { choices: (result.data ?? []) as StockChoice[], error: !!result.error };
}
