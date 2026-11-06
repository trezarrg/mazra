begin;

-- Derived values only. Physical movements, invoice amounts and cash are never rewritten.
-- A monotonic posting order disambiguates events sharing now() in the same transaction.
alter table public.stock_movements add column posting_order bigint generated always as identity;
create table public.stock_cost_inputs (
 movement_id uuid primary key references public.stock_movements(id),
 total_value numeric(24,8) not null check(total_value>=0),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.stock_valuation (
 movement_id uuid primary key references public.stock_movements(id) on delete cascade,
 value numeric, cogs numeric, stock_result numeric, issue text,
 check(value is null or value::text not in ('NaN','Infinity','-Infinity'))
);
create table public.stock_valuation_balances (
 product_id uuid not null references public.products(id), variant_id uuid references public.product_variants(id), unit text not null,
 quantity numeric not null, value numeric,
 unique nulls not distinct(product_id,variant_id,unit)
);
alter table public.stock_cost_inputs enable row level security;
alter table public.stock_valuation enable row level security;
alter table public.stock_valuation_balances enable row level security;
revoke all on public.stock_cost_inputs,public.stock_valuation,public.stock_valuation_balances from public,anon,authenticated;
grant select on public.stock_cost_inputs,public.stock_valuation,public.stock_valuation_balances to authenticated;
create policy stock_cost_office on public.stock_cost_inputs for select to authenticated using(public.office_access());
create policy valuation_office on public.stock_valuation for select to authenticated using(public.office_access());
create policy valuation_balance_office on public.stock_valuation_balances for select to authenticated using(public.office_access());
create trigger audit_stock_cost after insert or update on public.stock_cost_inputs for each row execute function public.audit_master_change();

create function public.rebuild_stock_valuation() returns void language plpgsql security definer set search_path='' as $$
declare
 e record; m record; b record; original record; v numeric; cost numeric; result numeric; problem text;
 input_cost numeric; output_weight numeric; remaining_weight numeric; remaining_cost numeric;
 original_id uuid; original_kind text; original_qty numeric; credit numeric;
begin
 perform public.lock_operations();
 delete from public.stock_valuation;
 delete from public.stock_valuation_balances;
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
   v:=null; cost:=0; result:=0; problem:=null;
   if m.unit<>'kg' then
    problem:='Satuan riwayat bukan kg; perlu pemeriksaan.';
   elsif m.source_type='reversal' then
    select sum(s.quantity) quantity,sum(sv.value) value,sum(sv.cogs) cogs,sum(sv.stock_result) stock_result,
     count(*) filter(where sv.value is null or sv.movement_id is null) missing
    into original from public.stock_movements s left join public.stock_valuation sv on sv.movement_id=s.id
    where s.source_id=original_id and s.product_id=m.product_id and s.variant_id is not distinct from m.variant_id and s.unit=m.unit and (s.quantity>0)<>(m.quantity>0);
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
   -- Zero physical balance clears unknown historical value, but does not hide the affected report entry.
   insert into public.stock_valuation(movement_id,value,cogs,stock_result,issue) values(m.id,v,cost,result,problem);
   update public.stock_valuation_balances set quantity=b.quantity+m.quantity,
    value=case when b.quantity+m.quantity=0 then 0 when b.quantity+m.quantity<0 then null else b.value+v end
   where product_id=m.product_id and variant_id is not distinct from m.variant_id and unit=m.unit;
  end loop;
 end loop;
 perform set_config('app.valuation_dirty','0',true);
end $$;
revoke all on function public.rebuild_stock_valuation() from public,anon,authenticated;

-- Deferred until every item and receipt is present; the whole posting rolls back if rebuilding fails.
create function public.mark_valuation_dirty() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.lock_operations(); perform set_config('app.valuation_dirty','1',true); return null; end $$;
create function public.flush_valuation() returns trigger language plpgsql security definer set search_path='' as $$
begin if current_setting('app.valuation_dirty',true)='1' then perform public.rebuild_stock_valuation(); end if; return null; end $$;
revoke all on function public.mark_valuation_dirty(),public.flush_valuation() from public,anon,authenticated;
create trigger stock_valuation_lock before insert or update or delete on public.stock_movements for each statement execute function public.mark_valuation_dirty();
create constraint trigger stock_valuation_flush after insert or update or delete on public.stock_movements deferrable initially deferred for each row execute function public.flush_valuation();

create function public.save_stock_cost(p_movement uuid,p_value numeric,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Pengisian modal memerlukan pemilik'; end if;
 perform public.lock_operations();
 if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or p_value<0 or p_value>999999999999999.99 or p_value<>round(p_value,2) or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Nilai modal atau alasan tidak valid'; end if;
 if not exists(select 1 from public.stock_movements where id=p_movement and quantity>0 and unit='kg' and source_type in ('opening','opening_correction','adjustment')) then raise exception 'Gerakan ini tidak menerima isian modal manual'; end if;
 insert into public.stock_cost_inputs(movement_id,total_value,reason,updated_by) values(p_movement,p_value,trim(p_reason),auth.uid())
 on conflict(movement_id) do update set total_value=excluded.total_value,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=clock_timestamp()
 where stock_cost_inputs.total_value is distinct from excluded.total_value or stock_cost_inputs.reason is distinct from excluded.reason;
 perform public.rebuild_stock_valuation();
end $$;
revoke all on function public.save_stock_cost(uuid,numeric,text) from public,anon;
grant execute on function public.save_stock_cost(uuid,numeric,text) to authenticated;

create view public.stock_cost_review with(security_invoker=true) as
select m.id,m.movement_date,m.product_id,m.variant_id,p.name product_name,v.name variant_name,m.quantity::text,m.unit,m.source_type,m.source_id,sv.issue,
 i.total_value::text total_value,i.reason,
 (m.quantity>0 and m.unit='kg' and m.source_type in ('opening','opening_correction','adjustment')) can_fill
from public.stock_movements m join public.stock_valuation sv on sv.movement_id=m.id join public.products p on p.id=m.product_id
left join public.product_variants v on v.id=m.variant_id left join public.stock_cost_inputs i on i.movement_id=m.id
where sv.issue is not null or i.movement_id is not null;
revoke all on public.stock_cost_review from public,anon;
grant select on public.stock_cost_review to authenticated;

-- Keep the existing public summary signature and all previous fields.
alter function public.business_summary(date,date) rename to business_summary_before_valuation;
revoke all on function public.business_summary_before_valuation(date,date) from public,anon,authenticated;
create function public.business_summary(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb; v_cogs numeric; v_result numeric; missing_cost integer; missing_result integer; inventory numeric; missing_inventory integer;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 s:=public.business_summary_before_valuation(p_start,p_end);
 select coalesce(sum(v.cogs),0),coalesce(sum(v.stock_result),0),count(*) filter(where v.cogs is null),count(*) filter(where v.stock_result is null)
 into v_cogs,v_result,missing_cost,missing_result from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id
 where (p_start is null or m.movement_date>=p_start) and (p_end is null or m.movement_date<=p_end);
 select coalesce(sum(value),0),count(*) filter(where value is null and quantity<>0) into inventory,missing_inventory from public.stock_valuation_balances;
 return s||jsonb_build_object('net_purchases',((s->>'purchases')::numeric-(s->>'purchase_returns')::numeric)::text,
  'cogs',case when missing_cost=0 then round(v_cogs,2)::text end,
  'gross_profit',case when missing_cost=0 then round((s->>'net_sales')::numeric-v_cogs,2)::text end,
  'stock_result',case when missing_result=0 then round(v_result,2)::text end,
  'business_profit',case when missing_cost+missing_result=0 then round((s->>'before_cogs')::numeric-v_cogs+v_result,2)::text end,
  'cost_complete',missing_cost=0,'profit_complete',missing_cost+missing_result=0,
  'missing_cost_entries',missing_cost+missing_result,'inventory_value',case when missing_inventory=0 then round(inventory,2)::text end,
  'missing_inventory',missing_inventory,'report_status',case when missing_cost+missing_result=0 then 'Sebelum pajak dan penyusutan' else 'Belum lengkap' end);
end $$;
revoke all on function public.business_summary(date,date) from public,anon;
grant execute on function public.business_summary(date,date) to authenticated;
select public.rebuild_stock_valuation();
notify pgrst,'reload schema';
commit;
