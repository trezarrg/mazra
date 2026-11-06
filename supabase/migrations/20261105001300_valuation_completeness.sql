begin;
-- Missing derived rows must never imply a zero HPP or a complete inventory value.
create or replace function public.business_summary(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb; v_cogs numeric; v_result numeric; missing_cost integer; missing_result integer; inventory numeric; missing_inventory integer;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 s:=public.business_summary_before_valuation(p_start,p_end);
 select coalesce(sum(v.cogs),0),coalesce(sum(v.stock_result),0),count(*) filter(where case when v.movement_id is null then m.source_type in ('sale','sale_return') or (m.source_type='reversal' and o.payload->>'original_kind' in ('sale','sale_return')) else v.cogs is null end),
 count(*) filter(where case when v.movement_id is null then m.source_type in ('adjustment','purchase_return','reversal') else v.stock_result is null end)
 into v_cogs,v_result,missing_cost,missing_result from public.stock_movements m left join public.stock_valuation v on m.id=v.movement_id left join public.operations o on o.id=m.source_id
 where (p_start is null or m.movement_date>=p_start) and (p_end is null or m.movement_date<=p_end);
 select coalesce(sum(b.value),0),count(*) filter(where b.value is null or b.quantity<>physical.quantity) into inventory,missing_inventory
 from (select product_id,variant_id,unit,sum(quantity) quantity from public.stock_movements group by product_id,variant_id,unit having sum(quantity)<>0) physical
 left join public.stock_valuation_balances b on b.product_id=physical.product_id and b.variant_id is not distinct from physical.variant_id and b.unit=physical.unit;
 return s||jsonb_build_object('net_purchases',((s->>'purchases')::numeric-(s->>'purchase_returns')::numeric)::text,
  'cogs',case when missing_cost=0 then round(v_cogs,2)::text end,
  'gross_profit',case when missing_cost=0 then round((s->>'net_sales')::numeric-v_cogs,2)::text end,
  'stock_result',case when missing_result=0 then round(v_result,2)::text end,
  'business_profit',case when missing_cost+missing_result=0 then round((s->>'before_cogs')::numeric-v_cogs+v_result,2)::text end,
  'cost_complete',missing_cost=0,'profit_complete',missing_cost+missing_result=0,
  'missing_cost_entries',missing_cost+missing_result,'inventory_value',case when missing_inventory=0 then round(inventory,2)::text end,
  'missing_inventory',missing_inventory,'report_status',case when missing_cost+missing_result=0 then 'Sebelum pajak dan penyusutan' else 'Belum lengkap' end);
end $$;

notify pgrst,'reload schema';
commit;
