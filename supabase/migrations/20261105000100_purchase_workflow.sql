begin;

create or replace view public.purchase_workflow with(security_invoker=true) as
select d.*,coalesce(b.paid,0)::text paid_amount,coalesce(b.balance,0)::text balance,
 case when d.status='cancelled' then 'cancelled'
      when d.receipt_count=0 then 'pending_receipt'
      when b.receipts is distinct from d.receipt_count then 'unavailable'
      when b.balance<=0 then 'paid' when b.paid>0 then 'partial' else 'unpaid' end payment_state
from public.purchase_list d
left join lateral (
 select count(*) receipts,sum(o.paid::numeric) paid,sum(greatest(o.balance_amount,0)) balance
 from public.purchase_receipts r join public.obligations o on o.source_id=r.id and o.kind='payable'
 where r.do_id=d.id
) b on true;

create or replace view public.workflow_documents with(security_invoker=true) as
select o.id,o.document_no,o.kind,o.operation_date,o.status,o.amount,o.created_at,
 raw.reversed_by,o.partner_name,o.search_text,null::text payment_state,
 '/dokumen/'||o.id::text href
from public.operation_list o join public.operations raw on raw.id=o.id
union all
select r.id,d.document_no,'purchase_receipt',r.receipt_date,'final',r.bill_amount::text,r.created_at,
 null::uuid,p.name,concat_ws(' ',d.document_no::text,p.name,pr.name,d.origin,r.note),
 case when b.source_id is null then 'unavailable' when b.balance_amount<=0 then 'paid'
      when b.paid::numeric>0 then 'partial' else 'unpaid' end,
 '/dokumen/pembelian/'||r.id::text
from public.purchase_receipts r
join public.purchase_dos d on d.id=r.do_id
join public.partners p on p.id=d.supplier_id
join public.products pr on pr.id=d.product_id
left join public.obligations b on b.source_id=r.id and b.kind='payable';

revoke all on public.purchase_workflow,public.workflow_documents from public,anon;
grant select on public.purchase_workflow,public.workflow_documents to authenticated;

create or replace function public.business_summary(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 'due_next3',coalesce((select sum(balance_amount) from public.obligations where kind='payable' and balance_amount>0 and due_date between v_today and v_today+3),0)::text,
 'cash_trend',coalesce((select jsonb_agg(t order by t.month) from(select to_char(movement_date,'YYYY-MM') as "month",coalesce(sum(amount) filter(where amount>0),0)::text incoming,coalesce(-sum(amount) filter(where amount<0),0)::text outgoing,sum(amount)::text net from public.cash_movements where (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end) group by to_char(movement_date,'YYYY-MM')) t),'[]'::jsonb));
end $$;
revoke all on function public.business_summary(date,date) from public,anon;
grant execute on function public.business_summary(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
