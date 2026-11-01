begin;
create view public.operation_list with(security_invoker=true) as
select o.*,p.name partner_name,concat_ws(' ',o.document_no::text,p.name,o.note,(select string_agg(pr.name||' '||coalesce(v.name,''),' ') from public.operation_items i join public.products pr on pr.id=i.product_id left join public.product_variants v on v.id=i.variant_id where i.operation_id=o.id)) search_text
from public.operation_details o left join public.partners p on p.id=o.partner_id;
create view public.payment_records with(security_invoker=true) as
select p.id,p.kind,p.source_id,p.payment_date,p.account_id,p.amount::text,p.note,p.reversed_by,p.created_by,p.created_at,a.name account_name from public.payments p join public.cash_accounts a on a.id=p.account_id;
create view public.item_details with(security_invoker=true) as
select i.id,i.operation_id,i.product_id,i.variant_id,i.unit,i.quantity::text,i.price::text,i.actual_weight::text,i.direction,p.name product_name,v.name variant_name from public.operation_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id;
revoke all on public.operation_list,public.payment_records,public.item_details from public,anon;
grant select on public.operation_list,public.payment_records,public.item_details to authenticated;

create or replace function public.save_finance_category(p_code text,p_name text,p_direction text,p_classification text,p_active boolean) returns text language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
 if p_code is null or p_code !~ '^custom_[a-z0-9_]{1,30}$' or length(trim(coalesce(p_name,''))) not between 1 and 100 or p_direction is null or p_direction not in ('in','out') or p_classification is null or p_classification not in ('income','expense','equity','owner') or p_active is null
 or (p_classification in ('income','equity') and p_direction<>'in') or (p_classification in ('expense','owner') and p_direction<>'out') then raise exception 'Arah uang dan klasifikasi kategori tidak sesuai'; end if;
 if exists(select 1 from public.finance_categories where code=p_code and (direction<>p_direction or classification<>p_classification)) then raise exception 'Klasifikasi kategori tidak dapat diubah'; end if;
 insert into public.finance_categories values(p_code,trim(p_name),p_direction,p_classification,p_active) on conflict(code) do update set name=excluded.name,active=excluded.active;
 return p_code;
end $$;

alter function public.business_summary(date,date) rename to business_summary_internal;
revoke all on function public.business_summary_internal(date,date) from authenticated;
create function public.business_summary(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; asset_result numeric; prev_start date; prev_end date; previous_sales numeric; v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 result:=public.business_summary_internal(p_start,p_end);
 select coalesce(sum((case when kind='reversal' then -1 else 1 end)*(amount-(payload->>'book_value')::numeric)),0) into asset_result from public.operations where kind in ('finance','reversal') and category='asset_sale' and status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 if p_start is not null and p_end is not null then
   prev_end:=p_start-1;prev_start:=p_start-(p_end-p_start+1);
   select coalesce(sum(case when kind='sale' then amount when kind='sale_return' then -amount when kind='reversal' and payload->>'original_kind'='sale_return' then amount else 0 end),0) into previous_sales from public.operations where status='final' and operation_date between prev_start and prev_end;
 end if;
 return result||jsonb_build_object('asset_disposal_result',asset_result::text,'before_cogs',((result->>'before_cogs')::numeric+asset_result)::text,'previous_sales',previous_sales::text,'previous_start',prev_start,'previous_end',prev_end,
 'due_next7',coalesce((select sum(balance_amount) from public.obligations where kind='payable' and balance_amount>0 and due_date between v_today and v_today+7),0)::text,
 'cash_trend',coalesce((select jsonb_agg(t order by t.month) from(select to_char(movement_date,'YYYY-MM') as "month",coalesce(sum(amount) filter(where amount>0),0)::text incoming,coalesce(-sum(amount) filter(where amount<0),0)::text outgoing,sum(amount)::text net from public.cash_movements where (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end) group by to_char(movement_date,'YYYY-MM')) t),'[]'::jsonb));
end $$;
revoke all on function public.business_summary(date,date) from public,anon;
grant execute on function public.business_summary(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
