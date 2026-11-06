begin;
create or replace view public.obligations with(security_invoker=true) as
select 'receivable'::text kind,o.id source_id,o.partner_id,p.name partner_name,'PJ-'||o.document_no reference,o.operation_date document_date,o.due_date,
 o.amount::text total,(coalesce(pay.amount,0)-coalesce(ret.refund,0))::text paid,coalesce(ret.amount,0)::text credited,
 (o.amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))::text balance,o.assigned_to,
 (o.amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0)) balance_amount
from public.operations o join public.partners p on p.id=o.partner_id
left join lateral(select sum(amount) amount from public.payments where source_id=o.id and kind='receivable' and reversed_by is null) pay on true
left join lateral(select sum(amount) amount,sum(refund_amount) refund from public.operations where source_id=o.id and kind='sale_return' and status='final' and reversed_by is null) ret on true
where o.kind='sale' and o.status='final' and o.reversed_by is null
union all
select 'payable',r.id,d.supplier_id,p.name,'DO-'||d.document_no||' / '||left(r.id::text,8),r.receipt_date,r.due_date,
 r.bill_amount::text,(coalesce(pay.amount,0)-coalesce(ret.refund,0))::text,coalesce(ret.amount,0)::text,
 (r.bill_amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))::text,null::uuid,
 (r.bill_amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))
from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id join public.partners p on p.id=d.supplier_id
left join lateral(select sum(amount) amount from public.payments where source_id=r.id and kind='payable' and reversed_by is null) pay on true
left join lateral(select sum(amount) amount,sum(refund_amount) refund from public.operations where source_id=r.id and kind='purchase_return' and status='final' and reversed_by is null) ret on true
where r.reversed_by is null;
create or replace view public.purchase_receipt_list with(security_invoker=true) as
select id,do_id,receipt_date,origin_weight::text,actual_weight::text,billing_quantity::text,bill_amount::text,note,stock_movement_id,created_by,created_at,due_date,discrepancy_review,reversed_by,unit_price::text,price_method from public.purchase_receipts;
create or replace view public.purchase_list with(security_invoker=true) as
select d.*,p.name supplier_name,pr.name product_name,coalesce(r.weight,0)::text actual_weight,coalesce(r.amount,0)::text bill_amount,coalesce(r.receipts,0) receipt_count,
 concat_ws(' ',d.document_no::text,p.name,pr.name,d.origin,d.note) search_text
from public.purchase_dos d join public.partners p on p.id=d.supplier_id join public.products pr on pr.id=d.product_id
left join lateral(select sum(actual_weight) weight,sum(bill_amount) amount,count(*) receipts from public.purchase_receipts where do_id=d.id and reversed_by is null) r on true;

create or replace view public.workflow_documents with(security_invoker=true) as
select o.id,o.document_no,o.kind,o.operation_date,o.status,o.amount,o.created_at,
 raw.reversed_by,o.partner_name,o.search_text,null::text payment_state,
 '/dokumen/'||o.id::text href
from public.operation_list o join public.operations raw on raw.id=o.id
union all
select r.id,d.document_no,'purchase_receipt',r.receipt_date,'final',r.bill_amount::text,r.created_at,
 r.reversed_by,p.name,concat_ws(' ',d.document_no::text,p.name,pr.name,d.origin,r.note),
 case when r.reversed_by is not null then 'cancelled' when b.source_id is null then 'unavailable' when b.balance_amount<=0 then 'paid'
      when b.paid::numeric>0 then 'partial' else 'unpaid' end,
 '/dokumen/pembelian/'||r.id::text
from public.purchase_receipts r
join public.purchase_dos d on d.id=r.do_id
join public.partners p on p.id=d.supplier_id
join public.products pr on pr.id=d.product_id
left join public.obligations b on b.source_id=r.id and b.kind='payable';


create or replace view public.sales_purchase_documents with(security_invoker=true) as
select d.id,d.document_no,d.kind,d.operation_date,d.status,d.amount,d.created_at,d.reversed_by,d.partner_name,d.search_text,
case when d.reversed_by is not null then 'cancelled' when b.balance_amount<=0 then 'paid' else 'unpaid' end payment_state,d.href
from public.workflow_documents d left join public.obligations b on b.source_id=d.id and b.kind=case when d.kind='sale' then 'receivable' else 'payable' end
where d.kind in ('sale','purchase_receipt') and d.status='final';
create or replace view public.sales_list with(security_invoker=true) as
select o.*,case when o.reversed_by is not null or o.status='cancelled' then 'cancelled' when o.status='draft' then 'draft' when b.source_id is null then 'unavailable' when b.balance_amount<=0 then 'paid' else 'unpaid' end payment_state
from public.operation_list o left join public.obligations b on b.source_id=o.id and b.kind='receivable' where o.kind='sale';
create or replace view public.transaction_history with(security_invoker=true) as
select o.id,'sale'::text kind,o.id document_id,o.operation_date document_date,'PJ-'||o.document_no reference,o.partner_id,p.name partner_name,o.amount::text amount,
 o.status,case when o.reversed_by is not null or o.status='cancelled' then 'cancelled' when o.status='draft' then 'draft' when b.balance_amount=0 then 'paid' when b.paid::numeric>0 then 'partial' else 'unpaid' end payment_state,
 concat_ws(' ',o.document_no::text,p.name,o.note) search_text
from public.operations o join public.partners p on p.id=o.partner_id left join public.obligations b on b.source_id=o.id and b.kind='receivable' where o.kind='sale'
union all
select r.id,'purchase',d.id,r.receipt_date,'DO-'||d.document_no,d.supplier_id,p.name,r.bill_amount::text,'final',
 case when r.reversed_by is not null then 'cancelled' when b.balance_amount=0 then 'paid' when b.paid::numeric>0 then 'partial' else 'unpaid' end,
 concat_ws(' ',d.document_no::text,p.name,d.origin,r.note)
from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id join public.partners p on p.id=d.supplier_id left join public.obligations b on b.source_id=r.id and b.kind='payable';

CREATE OR REPLACE FUNCTION public.business_summary_internal(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; sales numeric; purchases numeric; returns numeric; purchase_returns numeric; income numeric; expense numeric; wages numeric; cash numeric; receivable numeric; payable numeric;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 if p_start is not null and p_end is not null and p_start>p_end then raise exception 'Periode tidak valid'; end if;
 select coalesce(sum(case when kind='sale' then amount when kind='reversal' and payload->>'original_kind'='sale' then -amount else 0 end),0),coalesce(sum(case when kind='sale_return' then amount when kind='reversal' and payload->>'original_kind'='sale_return' then -amount else 0 end),0),coalesce(sum(case when kind='purchase_return' then amount when kind='reversal' and payload->>'original_kind'='purchase_return' then -amount else 0 end),0)
 into sales,returns,purchase_returns from public.operations where status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 select coalesce(sum(bill_amount),0) into purchases from public.purchase_receipts where (p_start is null or receipt_date>=p_start) and (p_end is null or receipt_date<=p_end);
 purchases:=purchases-coalesce((select sum(amount) from public.operations where kind='reversal' and payload->>'original_kind'='purchase_receipt' and status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end)),0);
 select coalesce(sum(case when o.kind='reversal' then -o.amount else o.amount end) filter(where c.classification='income'),0),coalesce(sum(case when o.kind='reversal' then -o.amount else o.amount end) filter(where c.classification='expense'),0) into income,expense
 from public.operations o join public.finance_categories c on c.code=o.category where o.kind in ('finance','reversal') and o.status='final' and (p_start is null or o.operation_date>=p_start) and (p_end is null or o.operation_date<=p_end);
 select coalesce(sum((case when kind='reversal' then -1 else 1 end)*(amount+coalesce(nullif(payload->>'advance_deduction','')::numeric,0))),0) into wages from public.operations where (kind='payroll' or (kind='reversal' and payload->>'original_kind'='payroll')) and status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 select coalesce(sum(amount),0) into cash from public.cash_movements;
 select coalesce(sum(balance_amount) filter(where kind='receivable'),0),coalesce(sum(balance_amount) filter(where kind='payable'),0) into receivable,payable from public.obligations;
 result:=jsonb_build_object('sales',sales::text,'sales_returns',returns::text,'net_sales',(sales-returns)::text,'purchases',purchases::text,'purchase_returns',purchase_returns::text,'cash',cash::text,'collector','0','receivable',receivable::text,'payable',payable::text,'other_income',income::text,'operating_expense',expense::text,'wages',wages::text,'before_cogs',(sales-returns+income-expense-wages)::text,'report_status','Belum lengkap',
 'attention',jsonb_build_object(
  'unreceived_dos',(select count(*) from public.purchase_dos d where d.status='open' and not exists(select 1 from public.purchase_receipts r where r.do_id=d.id)),
  'weight_discrepancies',(select count(*) from public.purchase_receipts where reversed_by is null and origin_weight is not null and actual_weight<>origin_weight and discrepancy_review is null),
  'pending_deposits',0,
  'overdue',(select count(*) from public.obligations where balance_amount>0 and due_date<(now() at time zone 'Asia/Jakarta')::date),
  'negative_stock',(select count(*) from public.stock_balances where balance::numeric<0)),
 'cash_positions',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'type',a.account_type,'opening',coalesce(m.opening,0)::text,'incoming',coalesce(m.incoming,0)::text,'outgoing',coalesce(m.outgoing,0)::text,'closing',coalesce(m.closing,0)::text,'current',coalesce(m.current_balance,0)::text)) from public.cash_accounts a left join lateral(
  select sum(amount) filter(where p_start is not null and movement_date<p_start) opening,
   sum(amount) filter(where amount>0 and (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end)) incoming,
   -sum(amount) filter(where amount<0 and (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end)) outgoing,
   sum(amount) filter(where p_end is null or movement_date<=p_end) closing,sum(amount) current_balance from public.cash_movements where account_id=a.id) m on true), '[]'::jsonb),
 'loans',coalesce((select jsonb_agg(t) from(select payload->>'loan_reference' reference,sum(case when category='loan_received' then amount else -amount end)::text balance from public.operations where status='final' and reversed_by is null and kind='finance' and category in ('loan_received','loan_principal') group by payload->>'loan_reference') t),'[]'::jsonb),
 'asset_cost',coalesce((select sum(cost) from public.fixed_assets where disposed_by is null),0)::text,
 'employee_advances',coalesce((select sum(advance_balance::numeric) from public.employee_balances),0)::text,
 'legacy_openings',(select count(*) from public.cash_movements where source_type='opening')+(select count(*) from public.opening_obligations),
 'stock',coalesce((select jsonb_agg(t) from(select unit,sum(balance::numeric)::text quantity from public.stock_balances group by unit) t),'[]'::jsonb));
 return result;
end $function$;


create or replace function public.business_summary_before_valuation(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; asset_result numeric; prev_start date; prev_end date; previous_sales numeric; v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 result:=public.business_summary_internal(p_start,p_end);
 select coalesce(sum((case when kind='reversal' then -1 else 1 end)*(amount-(payload->>'book_value')::numeric)),0) into asset_result from public.operations where kind in ('finance','reversal') and category='asset_sale' and status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 if p_start is not null and p_end is not null then
   prev_end:=p_start-1;prev_start:=p_start-(p_end-p_start+1);
   select coalesce(sum(case when kind='sale' then amount when kind='reversal' and payload->>'original_kind'='sale' then -amount when kind='sale_return' then -amount when kind='reversal' and payload->>'original_kind'='sale_return' then amount else 0 end),0) into previous_sales from public.operations where status='final' and operation_date between prev_start and prev_end;
 end if;
 return result||jsonb_build_object('asset_disposal_result',asset_result::text,'before_cogs',((result->>'before_cogs')::numeric+asset_result)::text,'previous_sales',previous_sales::text,'previous_start',prev_start,'previous_end',prev_end,
 'due_next7',coalesce((select sum(balance_amount) from public.obligations where kind='payable' and balance_amount>0 and due_date between v_today and v_today+7),0)::text,
 'due_next3',coalesce((select sum(balance_amount) from public.obligations where kind='payable' and balance_amount>0 and due_date between v_today and v_today+3),0)::text,
 'cash_trend',coalesce((select jsonb_agg(t order by t.month) from(select to_char(movement_date,'YYYY-MM') as "month",coalesce(sum(amount) filter(where amount>0),0)::text incoming,coalesce(-sum(amount) filter(where amount<0),0)::text outgoing,sum(amount)::text net from public.cash_movements where (p_start is null or movement_date>=p_start) and (p_end is null or movement_date<=p_end) group by to_char(movement_date,'YYYY-MM')) t),'[]'::jsonb));
end $$;

create or replace function public.rebuild_stock_valuation() returns void language plpgsql security definer set search_path='' as $$
declare
 e record; m record; b record; original record; v numeric; cost numeric; result numeric; problem text;
 variance numeric; book_out numeric; input_cost numeric; output_weight numeric; remaining_weight numeric; remaining_cost numeric;
 original_id uuid; original_kind text; original_qty numeric; credit numeric;
begin
 perform public.lock_operations();
 delete from public.stock_valuation where movement_id is not null;
 delete from public.stock_valuation_balances where product_id is not null;
 -- Business date first; timestamps and UUID break ties. One document is one event.
 for e in
  select coalesce(source_id,id) event_id,movement_date,min(posting_order) posted_order
  from public.stock_movements group by coalesce(source_id,id),movement_date
  order by movement_date,min(posting_order),coalesce(source_id,id)
 loop
  input_cost:=0; original_id:=null; original_kind:=null;
  select source_id,payload->>'original_kind' into original_id,original_kind from public.operations where id=e.event_id and kind='reversal';
  select coalesce(sum(quantity),0) into output_weight from public.stock_movements where coalesce(source_id,id)=e.event_id and movement_date=e.movement_date and quantity>0;
  remaining_weight:=output_weight; remaining_cost:=null;
  for m in select * from public.stock_movements where coalesce(source_id,id)=e.event_id and movement_date=e.movement_date order by (quantity>0),id
  loop
   insert into public.stock_valuation_balances(product_id,variant_id,unit,quantity,value) values(m.product_id,m.variant_id,m.unit,0,0) on conflict do nothing;
   select * into b from public.stock_valuation_balances where product_id=m.product_id and variant_id is not distinct from m.variant_id and unit=m.unit;
   v:=null; cost:=0; result:=0; variance:=0; problem:=null;
   if m.unit<>'kg' then
    problem:='Satuan riwayat bukan kg; perlu pemeriksaan.';
   elsif m.source_type='reversal' then
    select sum(s.quantity) quantity,sum(sv.value) value,sum(sv.cogs) cogs,sum(sv.stock_result) stock_result,
     count(*) filter(where sv.value is null or sv.movement_id is null) missing
    into original from public.stock_movements s left join public.stock_valuation sv on sv.movement_id=s.id
    where (s.source_id=original_id or s.id=(select stock_movement_id from public.purchase_receipts where id=original_id)) and s.product_id=m.product_id and s.variant_id is not distinct from m.variant_id and s.unit=m.unit and (s.quantity>0)<>(m.quantity>0);
    if original.quantity is null or original.missing>0 then problem:='Modal transaksi asal koreksi belum lengkap.';
    else
     v:=round(original.value*m.quantity/original.quantity,8);
     cost:=round(original.cogs*m.quantity/original.quantity,8);
     result:=round(original.stock_result*m.quantity/original.quantity,8);
    end if;
   elsif m.quantity<0 then
    if b.quantity<=0 or b.quantity+m.quantity<0 then problem:='Urutan riwayat membuat stok tidak cukup pada tanggal transaksi.';
    elsif b.value is null then problem:='Modal stok bahan belum lengkap.';
    else v:=case when b.quantity+m.quantity=0 then -b.value else round(m.quantity*b.value/b.quantity,8) end;
    end if;
   elsif m.source_type='purchase_receipt' then
    select bill_amount into v from public.purchase_receipts where stock_movement_id=m.id;
    if v is null then problem:='Nilai penerimaan pembelian belum tersedia.'; end if;
   elsif m.source_type='production' then
    if remaining_cost is null and remaining_weight=output_weight then remaining_cost:=input_cost; end if;
    if input_cost is null or output_weight<=0 then problem:='Modal bahan hasil potong belum lengkap.';
    else
     v:=case when m.quantity=remaining_weight then remaining_cost else round(input_cost*m.quantity/output_weight,8) end;
     remaining_cost:=remaining_cost-v;
    end if;
    remaining_weight:=remaining_weight-m.quantity;
   elsif m.source_type='sale_return' then
    select source_id into original_id from public.operations where id=m.source_id;
    select -sum(s.quantity) quantity,-sum(sv.value) value,count(*) filter(where sv.value is null or sv.movement_id is null) missing
    into original from public.stock_movements s left join public.stock_valuation sv on sv.movement_id=s.id
    where s.source_id=original_id and s.product_id=m.product_id and s.variant_id is not distinct from m.variant_id and s.unit=m.unit and s.quantity<0;
    if original.quantity is null or original.missing>0 then problem:='Modal penjualan asal retur belum lengkap.';
    else v:=round(original.value*m.quantity/original.quantity,8); end if;
   else
    select total_value into v from public.stock_cost_inputs where movement_id=m.id;
    if v is null and m.source_type in ('adjustment','opening_correction') and b.quantity>0 and b.value is not null then v:=round(m.quantity*b.value/b.quantity,8); end if;
    if v is null then problem:='Isi nilai modal stok masuk ini.'; end if;
   end if;
   if m.source_type='production' and m.quantity<0 then input_cost:=input_cost-v; end if;
   if m.source_type in ('sale','sale_return') then cost:=-v;
   elsif m.source_type='adjustment' then result:=v;
   elsif m.source_type='purchase_return' then
    select amount into credit from public.operations where id=m.source_id;
    select -sum(quantity) into original_qty from public.stock_movements where source_id=m.source_id and quantity<0;
    result:=round(credit*abs(m.quantity)/original_qty,8)+v;
   end if;
   if v is null then
    problem:=coalesce(problem,'Modal transaksi belum lengkap.');
    if m.source_type='reversal' then
     cost:=case when original_kind in ('sale','sale_return') then null else 0 end;
     result:=case when original_kind in ('adjustment','purchase_return') then null else 0 end;
    end if;
   end if;
   -- Undo the original cost exactly; a separately visible variance reconciles pooled average value.
   if m.source_type='reversal' and m.quantity<0 and v is not null then
    if b.quantity<=0 or b.quantity+m.quantity<0 or b.value is null then
     variance:=null; result:=null; problem:='Modal stok untuk koreksi belum lengkap; periksa transaksi sebelumnya.';
    else
     book_out:=case when b.quantity+m.quantity=0 then -b.value else round(m.quantity*b.value/b.quantity,8) end;
     variance:=book_out-v;
     result:=result+variance;
    end if;
   end if;
   -- Zero physical balance clears unknown historical value, but does not hide the affected report entry.
   insert into public.stock_valuation(movement_id,value,cogs,stock_result,issue,revaluation) values(m.id,v,cost,result,problem,variance);
   update public.stock_valuation_balances set quantity=b.quantity+m.quantity,
    value=case when b.quantity+m.quantity=0 then 0 when b.quantity+m.quantity<0 then null else b.value+v+variance end
   where product_id=m.product_id and variant_id is not distinct from m.variant_id and unit=m.unit;
  end loop;
 end loop;
 perform set_config('app.valuation_dirty','0',true);
end $$;



CREATE OR REPLACE FUNCTION public.record_delivery(p_id uuid, p_sale uuid, p_date date, p_stage text, p_items jsonb, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.operations%rowtype; e public.delivery_events%rowtype; item jsonb; line public.operation_items%rowtype; qty numeric; prior numeric; sent numeric;
begin
 perform public.lock_operations();
 select * into d from public.operations where id=p_sale and kind='sale' and status='final' and reversed_by is null;
 if not found then raise exception 'Penjualan tidak ditemukan'; end if;
 if not public.office_access() and (not public.has_app_role(array['driver']) or d.driver_id is distinct from auth.uid()) then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or p_date is null or p_stage is null or p_stage not in ('sent','received') or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 or length(coalesce(p_note,''))>1000 then raise exception 'Data pengiriman tidak valid'; end if;
 select * into e from public.delivery_events where id=p_id;
 if found then
   if e.created_by=auth.uid() and e.sale_id=p_sale and e.event_date=p_date and e.stage=p_stage and e.items=p_items and e.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
   raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if (select count(distinct x->>'item') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'Item pengiriman duplikat'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
   select * into line from public.operation_items where id=(item->>'item')::uuid and operation_id=p_sale;
   if not found then raise exception 'Item pengiriman tidak ditemukan'; end if;
   qty:=(item->>'quantity')::numeric;
   perform public.assert_stock(line.product_id,line.variant_id,line.unit,qty,false);
   select coalesce(sum((x->>'quantity')::numeric),0) into prior from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.cancelled_at is null and ev.stage=p_stage and x->>'item'=line.id::text;
   if p_stage='sent' then sent:=line.quantity;
   else select coalesce(sum((x->>'quantity')::numeric),0) into sent from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.cancelled_at is null and ev.stage='sent' and x->>'item'=line.id::text; end if;
   if prior+qty>sent then raise exception 'Jumlah pengiriman atau penerimaan melebihi dokumen asal'; end if;
 end loop;
 insert into public.delivery_events(id,sale_id,event_date,stage,items,note,created_by) values(p_id,p_sale,p_date,p_stage,p_items,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $function$;


CREATE OR REPLACE FUNCTION public.post_payment(p_id uuid, p_kind text, p_source uuid, p_date date, p_account uuid, p_amount numeric, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_total numeric; v_paid numeric; v_credit numeric; v_payload jsonb; existing public.payments%rowtype;
begin
 perform public.lock_operations();
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.assert_amount(p_amount);
 if p_id is null or p_date is null or p_kind is null or p_kind not in ('receivable','payable') or length(coalesce(p_note,''))>1000 then raise exception 'Data pembayaran tidak valid'; end if;
 v_payload:=jsonb_build_object('kind',p_kind,'source',p_source,'date',p_date,'account',p_account,'amount',p_amount,'note',nullif(trim(p_note),''));
 select * into existing from public.payments where id=p_id;
 if found then
   if existing.created_by=auth.uid() and existing.payload=v_payload then return p_id; end if;
   raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if p_kind='receivable' then
   select amount into v_total from public.operations where id=p_source and kind='sale' and status='final' and reversed_by is null;
 else select bill_amount into v_total from public.purchase_receipts where id=p_source and reversed_by is null; end if;
 if v_total is null then raise exception 'Tagihan tidak ditemukan'; end if;
 select coalesce(sum(amount),0) into v_paid from public.payments where source_id=p_source and kind=p_kind and reversed_by is null;
 select coalesce(sum(amount-refund_amount),0) into v_credit from public.operations where source_id=p_source and kind=case when p_kind='receivable' then 'sale_return' else 'purchase_return' end and status='final' and reversed_by is null;
 if p_amount>v_total-v_paid-v_credit then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
 if not exists(select 1 from public.cash_accounts where id=p_account and account_type in ('cash','bank') and active) then raise exception 'Gunakan kas kantor atau bank'; end if;
 insert into public.payments values(p_id,p_kind,p_source,p_date,p_account,p_amount,nullif(trim(p_note),''),v_payload,auth.uid(),now());
 perform public.move_cash(p_id,'payment',p_date,p_account,case when p_kind='receivable' then p_amount else -p_amount end,p_note);
 return p_id;
end $function$;


select public.rebuild_stock_valuation();
notify pgrst,'reload schema';
commit;
