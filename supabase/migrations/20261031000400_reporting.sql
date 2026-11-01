begin;
-- Kolom nominal untuk penyaringan numerik; teks nominal tetap tersedia bagi UI.
create or replace view public.obligations with(security_invoker=true) as
select 'receivable'::text kind,o.id source_id,o.partner_id,p.name partner_name,'PJ-'||o.document_no reference,o.operation_date document_date,o.due_date,
 o.amount::text total,(coalesce(pay.amount,0)-coalesce(ret.refund,0))::text paid,coalesce(ret.amount,0)::text credited,
 (o.amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))::text balance,o.assigned_to,
 (o.amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0)) balance_amount
from public.operations o join public.partners p on p.id=o.partner_id
left join lateral(select sum(amount) amount from public.payments where source_id=o.id and kind='receivable') pay on true
left join lateral(select sum(amount) amount,sum(refund_amount) refund from public.operations where source_id=o.id and kind='sale_return' and status='final') ret on true
where o.kind='sale' and o.status='final'
union all
select 'payable',r.id,d.supplier_id,p.name,'DO-'||d.document_no||' / '||left(r.id::text,8),r.receipt_date,r.due_date,
 r.bill_amount::text,(coalesce(pay.amount,0)-coalesce(ret.refund,0))::text,coalesce(ret.amount,0)::text,
 (r.bill_amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))::text,null::uuid,
 (r.bill_amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))
from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id join public.partners p on p.id=d.supplier_id
left join lateral(select sum(amount) amount from public.payments where source_id=r.id and kind='payable') pay on true
left join lateral(select sum(amount) amount,sum(refund_amount) refund from public.operations where source_id=r.id and kind='purchase_return' and status='final') ret on true;

create view public.document_list with(security_invoker=true) as
select o.*,p.name partner_name,
 concat_ws(' ',o.document_no::text,p.name,o.note,(select string_agg(pr.name||' '||coalesce(v.name,''),' ') from public.operation_items i join public.products pr on pr.id=i.product_id left join public.product_variants v on v.id=i.variant_id where i.operation_id=o.id)) search_text
from public.operations o left join public.partners p on p.id=o.partner_id;
create view public.purchase_list with(security_invoker=true) as
select d.*,p.name supplier_name,pr.name product_name,coalesce(r.weight,0)::text actual_weight,coalesce(r.amount,0)::text bill_amount,coalesce(r.receipts,0) receipt_count,
 concat_ws(' ',d.document_no::text,p.name,pr.name,d.origin,d.note) search_text
from public.purchase_dos d join public.partners p on p.id=d.supplier_id join public.products pr on pr.id=d.product_id
left join lateral(select sum(actual_weight) weight,sum(bill_amount) amount,count(*) receipts from public.purchase_receipts where do_id=d.id) r on true;
create view public.transaction_history with(security_invoker=true) as
select o.id,'sale'::text kind,o.id document_id,o.operation_date document_date,'PJ-'||o.document_no reference,o.partner_id,p.name partner_name,o.amount::text amount,
 o.status,case when o.status='draft' then 'draft' when b.balance_amount=0 then 'paid' when b.paid::numeric>0 then 'partial' else 'unpaid' end payment_state,
 concat_ws(' ',o.document_no::text,p.name,o.note) search_text
from public.operations o join public.partners p on p.id=o.partner_id left join public.obligations b on b.source_id=o.id and b.kind='receivable' where o.kind='sale'
union all
select r.id,'purchase',d.id,r.receipt_date,'DO-'||d.document_no,d.supplier_id,p.name,r.bill_amount::text,'final',
 case when b.balance_amount=0 then 'paid' when b.paid::numeric>0 then 'partial' else 'unpaid' end,
 concat_ws(' ',d.document_no::text,p.name,d.origin,r.note)
from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id join public.partners p on p.id=d.supplier_id left join public.obligations b on b.source_id=r.id and b.kind='payable';
create view public.finance_ledger with(security_invoker=true) as
select m.id,m.account_id,a.name account_name,a.account_type,m.amount::text amount,m.amount amount_value,m.movement_date,m.source_type,m.source_id,m.note,m.created_at,
 coalesce(o.category,case when pay.kind='receivable' then 'customer_payment' when pay.kind='payable' then 'supplier_payment' else m.source_type end) category,
 c.name category_name,c.classification,pay.source_id payment_source_id,
 concat_ws(' ',a.name,m.note,c.name,m.source_type) search_text
from public.cash_movements m join public.cash_accounts a on a.id=m.account_id
left join public.operations o on o.id=m.source_id and m.source_type<>'payment'
left join public.payments pay on pay.id=m.source_id and m.source_type='payment'
left join public.finance_categories c on c.code=o.category;
revoke all on public.document_list,public.purchase_list,public.transaction_history,public.finance_ledger from public,anon;
grant select on public.document_list,public.purchase_list,public.transaction_history,public.finance_ledger to authenticated;

create function public.business_summary(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; sales numeric; purchases numeric; returns numeric; purchase_returns numeric; income numeric; expense numeric; wages numeric; cash numeric; collector numeric; receivable numeric; payable numeric;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 if p_start is not null and p_end is not null and p_start>p_end then raise exception 'Periode tidak valid'; end if;
 select coalesce(sum(amount) filter(where kind='sale'),0),coalesce(sum(amount) filter(where kind='sale_return'),0),coalesce(sum(amount) filter(where kind='purchase_return'),0)
 into sales,returns,purchase_returns from public.operations where status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 select coalesce(sum(bill_amount),0) into purchases from public.purchase_receipts where (p_start is null or receipt_date>=p_start) and (p_end is null or receipt_date<=p_end);
 select coalesce(sum(o.amount) filter(where c.classification='income'),0),coalesce(sum(o.amount) filter(where c.classification='expense'),0) into income,expense
 from public.operations o join public.finance_categories c on c.code=o.category where o.kind='finance' and o.status='final' and (p_start is null or o.operation_date>=p_start) and (p_end is null or o.operation_date<=p_end);
 select coalesce(sum(amount+coalesce(nullif(payload->>'advance_deduction','')::numeric,0)),0) into wages from public.operations where kind='payroll' and status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 select coalesce(sum(m.amount),0),coalesce(sum(m.amount) filter(where a.account_type='collector'),0) into cash,collector from public.cash_movements m join public.cash_accounts a on a.id=m.account_id;
 select coalesce(sum(balance_amount) filter(where kind='receivable'),0),coalesce(sum(balance_amount) filter(where kind='payable'),0) into receivable,payable from public.obligations;
 result:=jsonb_build_object('sales',sales::text,'sales_returns',returns::text,'net_sales',(sales-returns)::text,'purchases',purchases::text,'purchase_returns',purchase_returns::text,'cash',cash::text,'collector',collector::text,'receivable',receivable::text,'payable',payable::text,'other_income',income::text,'operating_expense',expense::text,'wages',wages::text,'before_cogs',(sales-returns+income-expense-wages)::text,'report_status','Belum lengkap',
 'attention',jsonb_build_object(
  'unreceived_dos',(select count(*) from public.purchase_dos d where d.status='open' and not exists(select 1 from public.purchase_receipts r where r.do_id=d.id)),
  'weight_discrepancies',(select count(*) from public.purchase_receipts where origin_weight is not null and actual_weight<>origin_weight and discrepancy_review is null),
  'pending_deposits',(select count(*) from public.operations where kind='deposit' and status='pending'),
  'overdue',(select count(*) from public.obligations where balance_amount>0 and due_date<(now() at time zone 'Asia/Jakarta')::date),
  'negative_stock',(select count(*) from public.stock_balances where balance::numeric<0)),
 'cash_positions',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'type',a.account_type,'opening',coalesce(m.opening,0)::text,'incoming',coalesce(m.incoming,0)::text,'outgoing',coalesce(m.outgoing,0)::text,'closing',coalesce(m.closing,0)::text,'current',coalesce(m.current_balance,0)::text)) from public.cash_accounts a left join lateral(
  select sum(amount) filter(where p_start is not null and movement_date<p_start) opening,
   sum(amount) filter(where amount>0 and (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end)) incoming,
   -sum(amount) filter(where amount<0 and (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end)) outgoing,
   sum(amount) filter(where p_end is null or movement_date<=p_end) closing,sum(amount) current_balance from public.cash_movements where account_id=a.id) m on true), '[]'::jsonb),
 'loans',coalesce((select jsonb_agg(t) from(select payload->>'loan_reference' reference,sum(case when category='loan_received' then amount else -amount end)::text balance from public.operations where status='final' and kind='finance' and category in ('loan_received','loan_principal') group by payload->>'loan_reference') t),'[]'::jsonb),
 'asset_cost',coalesce((select sum(cost) from public.fixed_assets where disposed_by is null),0)::text,
 'employee_advances',coalesce((select sum(advance_balance::numeric) from public.employee_balances),0)::text,
 'legacy_openings',(select count(*) from public.cash_movements where source_type='opening')+(select count(*) from public.opening_obligations),
 'stock',coalesce((select jsonb_agg(t) from(select unit,sum(balance::numeric)::text quantity from public.stock_balances group by unit) t),'[]'::jsonb));
 return result;
end $$;
revoke all on function public.business_summary(date,date) from public,anon;
grant execute on function public.business_summary(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
