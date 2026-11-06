begin;
-- Preserve original reversal cost and reconcile the pooled inventory value separately.
alter table public.stock_valuation add column revaluation numeric default 0;
create or replace function public.rebuild_stock_valuation() returns void language plpgsql security definer set search_path='' as $$
declare
 e record; m record; b record; original record; v numeric; cost numeric; result numeric; problem text;
 variance numeric; book_out numeric; input_cost numeric; output_weight numeric; remaining_weight numeric; remaining_cost numeric;
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
   v:=null; cost:=0; result:=0; variance:=0; problem:=null;
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

select public.rebuild_stock_valuation();
notify pgrst,'reload schema';
commit;
