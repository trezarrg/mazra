begin;
alter table public.purchase_receipts add column reversed_by uuid references public.operations(id);
alter table public.purchase_receipts add column unit_price numeric(20,2);
alter table public.purchase_receipts add column price_method text check(price_method in ('kg','ekor','borongan'));
update public.purchase_receipts r set unit_price=d.price,price_method=d.price_method from public.purchase_dos d where d.id=r.do_id;
create function public.receipt_price_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin select price,price_method into new.unit_price,new.price_method from public.purchase_dos where id=new.do_id; return new; end $$;
create trigger receipt_price_snapshot before insert on public.purchase_receipts for each row execute function public.receipt_price_snapshot();
revoke all on function public.receipt_price_snapshot() from public,anon,authenticated;
alter table public.delivery_events add column cancelled_at timestamptz;
alter table public.delivery_events add column cancelled_by uuid references auth.users(id);
alter table public.delivery_events add column cancellation_reason text;

create table public.transaction_changes (
 id uuid primary key, source_kind text not null check(source_kind in ('operation','receipt','payment')),
 source_id uuid not null, action text not null check(action in ('cancel','replace','metadata')),
 replacement_id uuid, reason text not null, request jsonb not null, before_data jsonb not null, after_data jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create index transaction_changes_source on public.transaction_changes(source_kind,source_id,created_at);
alter table public.transaction_changes enable row level security;
revoke all on public.transaction_changes from public,anon,authenticated;
grant select on public.transaction_changes to authenticated;
create policy transaction_changes_office on public.transaction_changes for select to authenticated using(public.office_access());

create function public.transaction_snapshot(p_kind text,p_source uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_kind='operation' then
  select to_jsonb(o)||jsonb_build_object('amount',o.amount::text,'discount',o.discount::text,'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',i.quantity::text,'price',i.price::text,'actual_weight',i.actual_weight::text) order by i.id) from public.operation_items i where i.operation_id=o.id),'[]'::jsonb)) into result from public.operations o where id=p_source;
 elsif p_kind='receipt' then select to_jsonb(r)||jsonb_build_object('bill_amount',r.bill_amount::text,'actual_weight',r.actual_weight::text,'billing_quantity',r.billing_quantity::text,'unit_price',r.unit_price::text) into result from public.purchase_receipts r where id=p_source;
 elsif p_kind='payment' then select to_jsonb(p)||jsonb_build_object('amount',p.amount::text) into result from public.payments p where id=p_source;
 end if;
 return result;
end $$;
revoke all on function public.transaction_snapshot(text,uuid) from public,anon,authenticated;

-- Pooled stock has no DO allocations: do not claim a specific lot was consumed.
create function public.assert_transaction_unused(p_kind text,p_source uuid) returns void language plpgsql security definer set search_path='' as $$
declare output record; used record;
begin
 for output in select m.* from public.stock_movements m where m.quantity>0 and
  ((p_kind='receipt' and m.id=(select stock_movement_id from public.purchase_receipts where id=p_source)) or (p_kind='operation' and m.source_id=p_source))
 loop
  select p.name,o.document_no,o.kind into used from public.stock_movements s
  join public.products p on p.id=s.product_id left join public.operations o on o.id=s.source_id
  where s.product_id=output.product_id and s.variant_id is not distinct from output.variant_id and s.unit=output.unit and s.quantity<0
   and s.source_id is distinct from p_source and s.source_type<>'reversal'
   and (s.movement_date,s.posting_order)>(output.movement_date,output.posting_order)
   and (o.id is null or (o.status='final' and o.reversed_by is null))
  order by s.movement_date,s.posting_order limit 1;
  if found then raise exception 'Stok % sudah dipakai setelah transaksi ini% Periksa dan selesaikan transaksi lanjutan terlebih dahulu.',used.name,case when used.document_no is not null then ' (dokumen #'||used.document_no||').' else '.' end; end if;
 end loop;
end $$;
revoke all on function public.assert_transaction_unused(text,uuid) from public,anon,authenticated;

alter function public.reverse_document(uuid,text,uuid,date,text) rename to reverse_document_legacy;
revoke all on function public.reverse_document_legacy(uuid,text,uuid,date,text) from public,anon,authenticated;
create function public.reverse_transaction_internal(p_id uuid,p_kind text,p_source uuid,p_date date,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; r public.purchase_receipts%rowtype; m record; dt date;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_id is null or p_source is null or p_date is null or length(trim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Tanggal dan alasan pembatalan wajib diisi'; end if;
 if p_kind='receipt' then
  select * into r from public.purchase_receipts where id=p_source for update;
  if not found or r.reversed_by is not null then raise exception 'Penerimaan sudah dibatalkan atau tidak tersedia'; end if;
  dt:=r.receipt_date;
 elsif p_kind='operation' then
  select * into d from public.operations where id=p_source for update;
  if not found or d.reversed_by is not null or d.status not in ('final','verified') then raise exception 'Transaksi sudah dibatalkan atau tidak tersedia'; end if;
  dt:=d.operation_date;
 elsif p_kind='payment' then
  select payment_date into dt from public.payments where id=p_source and reversed_by is null;
  if not found then raise exception 'Pembayaran sudah dibatalkan atau tidak tersedia'; end if;
 else raise exception 'Jenis transaksi tidak valid'; end if;
 if p_date<dt then raise exception 'Tanggal pembatalan tidak boleh sebelum tanggal transaksi'; end if;
 if p_kind in ('receipt','operation') then
  if exists(select 1 from public.payments where source_id=p_source and reversed_by is null) then raise exception 'Masih ada pembayaran aktif. Periksa uang sebenarnya dan batalkan catatan pembayaran yang salah terlebih dahulu.'; end if;
  if exists(select 1 from public.operations where source_id=p_source and kind in ('sale_return','purchase_return') and status='final' and reversed_by is null) then raise exception 'Masih ada retur aktif. Selesaikan atau batalkan retur yang salah terlebih dahulu.'; end if;
  if p_kind='receipt' or d.kind in ('production','adjustment') then perform public.assert_transaction_unused(p_kind,p_source); end if;
  if d.kind='sale' and exists(select 1 from public.delivery_events where sale_id=p_source and cancelled_at is null) then raise exception 'Pengiriman sudah dicatat. Gunakan retur bila barang benar-benar dikirim; jika catatannya salah, batalkan catatan pengiriman terlebih dahulu.'; end if;
 end if;
 if p_kind='receipt' or (p_kind='operation' and d.kind='sale') then
  insert into public.operations(id,kind,operation_date,status,source_id,amount,note,payload,created_by,finalized_by)
  values(p_id,'reversal',p_date,'final',p_source,case when p_kind='receipt' then r.bill_amount else d.amount end,trim(p_note),jsonb_build_object('original_kind',case when p_kind='receipt' then 'purchase_receipt' else 'sale' end,'date',p_date),auth.uid(),auth.uid());
  for m in select * from public.stock_movements where (p_kind='receipt' and id=r.stock_movement_id) or (p_kind='operation' and source_id=p_source) order by quantity desc loop
   perform public.move_stock(p_id,'reversal',p_date,m.product_id,m.variant_id,m.unit,-m.quantity,p_note);
  end loop;
  if p_kind='receipt' then
   update public.purchase_receipts set reversed_by=p_id where id=p_source;
   if not exists(select 1 from public.purchase_receipts where do_id=r.do_id and reversed_by is null) and not exists(select 1 from public.receipt_measurements where do_id=r.do_id and status='pending') then update public.purchase_dos set status='cancelled',close_reason=trim(p_note) where id=r.do_id; end if;
  else update public.operations set reversed_by=p_id where id=p_source; end if;
  return p_id;
 end if;
 return public.reverse_document_legacy(p_id,p_kind,p_source,p_date,p_note);
end $$;
revoke all on function public.reverse_transaction_internal(uuid,text,uuid,date,text) from public,anon,authenticated;

create function public.sale_stock_signature(p_items jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_agg(jsonb_build_object('product',i->>'product','variant',nullif(i->>'variant',''),'unit',i->>'unit','quantity',(i->>'quantity')::numeric,'weight',nullif(i->>'weight','')::numeric) order by n)
 from jsonb_array_elements(p_items) with ordinality x(i,n);
$$;
revoke all on function public.sale_stock_signature(jsonb) from public,anon,authenticated;

create function public.change_transaction(p_id uuid,p_kind text,p_source uuid,p_action text,p_date date,p_reason text,p_data jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 previous public.transaction_changes%rowtype; req jsonb; before_doc jsonb; after_doc jsonb; dest uuid:=p_source;
 d public.operations%rowtype; r public.purchase_receipts%rowtype; ord public.purchase_dos%rowtype; pay public.payments%rowtype;
 data jsonb:=coalesce(p_data,'{}'); item jsonb; old_item jsonb; line_id uuid; used uuid[]:='{}'; n bigint;
 amount numeric:=0; discount numeric; paid numeric; qty numeric; price numeric; method text; financial_only boolean:=false; new_order uuid; driver uuid;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_id is null or p_source is null or p_kind is null or p_kind not in ('operation','receipt','payment') or p_action is null or p_action not in ('cancel','replace','metadata') or p_date is null or length(trim(coalesce(p_reason,''))) not between 1 and 1000 or jsonb_typeof(data)<>'object' then raise exception 'Data perubahan atau alasan tidak valid'; end if;
 req:=jsonb_build_object('kind',p_kind,'source',p_source,'action',p_action,'date',p_date,'reason',trim(p_reason),'data',data);
 select * into previous from public.transaction_changes where id=p_id;
 if found then
  if previous.created_by=auth.uid() and previous.request=req then return coalesce(previous.replacement_id,p_source); end if;
  raise exception 'Permintaan perubahan sudah digunakan dengan data berbeda';
 end if;
 before_doc:=public.transaction_snapshot(p_kind,p_source);
 if before_doc is null then raise exception 'Transaksi tidak ditemukan'; end if;
 if length(coalesce(data->>'note',''))>1000 then raise exception 'Catatan maksimal 1000 karakter'; end if;
 if p_kind='operation' then select * into d from public.operations where id=p_source for update;
 elsif p_kind='receipt' then select * into r from public.purchase_receipts where id=p_source for update; select * into ord from public.purchase_dos where id=r.do_id;
 else select * into pay from public.payments where id=p_source for update; end if;
 if before_doc->>'reversed_by' is not null then raise exception 'Transaksi sudah dibatalkan'; end if;
 if p_kind='operation' and d.status not in ('final','verified') then raise exception 'Gunakan formulir draft untuk transaksi yang belum selesai'; end if;
 if p_action='cancel' then
  perform public.reverse_transaction_internal(p_id,p_kind,p_source,p_date,p_reason);
 elsif p_action='metadata' then
  if p_kind='payment' or length(coalesce(data->>'note',''))>1000 then raise exception 'Keterangan tidak valid'; end if;
  if p_kind='receipt' then update public.purchase_receipts set note=nullif(data->>'note',''),due_date=nullif(data->>'due','')::date where id=p_source;
  else
   driver:=case when d.kind='sale' then nullif(data->>'driver','')::uuid else d.driver_id end;
   if driver is not null and not exists(select 1 from public.profiles p where id=driver and active and (role='driver' or exists(select 1 from public.profile_extra_roles e where e.profile_id=p.id and role='driver'))) then raise exception 'Sopir tidak aktif'; end if;
   update public.operations set note=nullif(data->>'note',''),due_date=case when d.kind='sale' then nullif(data->>'due','')::date else due_date end,driver_id=driver,
    payload=payload||jsonb_build_object('note',data->>'note')||case when d.kind='sale' then jsonb_build_object('due',data->>'due','driver',driver) else '{}' end,updated_at=clock_timestamp() where id=p_source;
  end if;
 elsif p_kind='receipt' then
  method:=data->>'method'; price:=(data->>'price')::numeric; qty:=nullif(data->>'billing_quantity','')::numeric;
  perform public.assert_amount(price,true);
  if method not in ('kg','ekor','borongan') or method is null then raise exception 'Dasar harga tidak valid'; end if;
  if method='borongan' then amount:=(data->>'lump_amount')::numeric;
  else
   if qty is null or qty<=0 or qty<>round(qty,3) or (method='ekor' and qty<>trunc(qty)) then raise exception 'Isi berat/jumlah yang ditagihkan dengan benar'; end if;
   amount:=round(price*qty,2);
  end if;
  perform public.assert_amount(amount,true);
  if exists(select 1 from public.operations where source_id=p_source and kind='purchase_return' and status='final' and reversed_by is null) then raise exception 'Masih ada retur aktif. Periksa retur sebelum memperbaiki penerimaan.'; end if;
  financial_only:=(data->>'product')::uuid=ord.product_id and (data->>'supplier')::uuid=ord.supplier_id and (data->>'date')::date=r.receipt_date and (data->>'actual_weight')::numeric=r.actual_weight;
  if financial_only then
   select coalesce(sum(p.amount),0) into paid from public.payments p where source_id=p_source and reversed_by is null;
   if amount<paid then raise exception 'Total baru lebih kecil dari pembayaran aktif. Periksa dan koreksi catatan pembayaran yang salah terlebih dahulu; uang nyata tidak dikembalikan otomatis.'; end if;
   if length(coalesce(data->>'note',''))>1000 or (nullif(data->>'origin_weight','')::numeric is not null and nullif(data->>'origin_weight','')::numeric<=0) then raise exception 'Berat asal atau catatan tidak valid'; end if;
   update public.purchase_receipts set billing_quantity=case when method='borongan' then null else qty end,bill_amount=amount,unit_price=price,price_method=method,
    origin_weight=nullif(data->>'origin_weight','')::numeric,note=nullif(data->>'note',''),due_date=nullif(data->>'due','')::date where id=p_source;
   perform public.rebuild_stock_valuation();
  else
   perform public.reverse_transaction_internal(p_id,'receipt',p_source,r.receipt_date,p_reason);
   new_order:=gen_random_uuid(); dest:=gen_random_uuid();
   perform public.create_purchase_do(new_order,(data->>'date')::date,(data->>'supplier')::uuid,(data->>'product')::uuid,ord.origin,(data->>'actual_weight')::numeric,ord.estimated_count,method,price,ord.note);
   perform public.confirm_purchase_receipt(dest,new_order,(data->>'date')::date,nullif(data->>'origin_weight','')::numeric,(data->>'actual_weight')::numeric,case when method='borongan' then null else qty end,case when method='borongan' then amount else null end,nullif(data->>'note',''));
   update public.purchase_receipts set due_date=nullif(data->>'due','')::date where id=dest;
  end if;
 elsif p_kind='operation' then
  financial_only:=d.kind='sale' and (data->>'date')::date=d.operation_date and (data->>'partner')::uuid=d.partner_id and public.sale_stock_signature(data->'items')=public.sale_stock_signature(d.payload->'items');
  if financial_only then
   if exists(select 1 from public.operations where source_id=p_source and kind='sale_return' and status='final' and reversed_by is null) then raise exception 'Masih ada retur aktif. Periksa retur sebelum memperbaiki penjualan.'; end if;
   if coalesce(nullif(data->>'paid','')::numeric,0)<>0 then raise exception 'Pembayaran dicatat terpisah saat memperbaiki invoice'; end if;
   for item,n in select value,ordinality from jsonb_array_elements(data->'items') with ordinality loop
    price:=(item->>'price')::numeric; perform public.assert_amount(price,true); amount:=amount+round((item->>'quantity')::numeric*price,2);
    old_item:=d.payload->'items'->(n::integer-1);
    select i.id into line_id from public.operation_items i where i.operation_id=p_source and i.product_id=(old_item->>'product')::uuid and variant_id is not distinct from nullif(old_item->>'variant','')::uuid
     and i.unit=old_item->>'unit' and i.quantity=(old_item->>'quantity')::numeric and i.price=(old_item->>'price')::numeric and not(i.id=any(used)) order by i.id limit 1;
    if line_id is null then raise exception 'Rincian item berubah. Muat ulang sebelum memperbaiki.'; end if;
    -- Qualify the local variable below to avoid confusing it with the table column.
    update public.operation_items i set price=(item->>'price')::numeric where i.id=line_id;
    used:=array_append(used,line_id);
   end loop;
   discount:=coalesce(nullif(data->>'discount','')::numeric,0); perform public.assert_amount(discount,true);
   if discount>amount then raise exception 'Diskon melebihi total item'; end if;
   amount:=amount-discount; perform public.assert_amount(amount,true);
   select coalesce(sum(p.amount),0) into paid from public.payments p where source_id=p_source and reversed_by is null;
   if amount<paid then raise exception 'Total baru lebih kecil dari pembayaran aktif. Koreksi catatan pembayaran yang salah terlebih dahulu; uang nyata tidak dikembalikan otomatis.'; end if;
   update public.operations o set amount=(select sum(round((i->>'quantity')::numeric*(i->>'price')::numeric,2)) from jsonb_array_elements(data->'items') i)-discount,
    discount=coalesce(nullif(data->>'discount','')::numeric,0),payload=data||jsonb_build_object('paid','0'),note=nullif(data->>'note',''),due_date=nullif(data->>'due','')::date,updated_at=clock_timestamp() where o.id=p_source;
  else
   if d.kind not in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer','payroll','advance','advance_repayment') then raise exception 'Jenis transaksi ini tidak dapat diperbaiki'; end if;
   perform public.reverse_transaction_internal(p_id,'operation',p_source,d.operation_date,p_reason);
   dest:=gen_random_uuid();
   if d.kind in ('payroll','advance','advance_repayment') then perform public.post_hr(dest,d.kind,data);
   else perform public.save_operation(dest,d.kind,case when d.kind='sale' then data||jsonb_build_object('paid','0') else data end,true); end if;
  end if;
 else
  perform public.reverse_transaction_internal(p_id,'payment',p_source,pay.payment_date,p_reason);
  dest:=gen_random_uuid();
  perform public.post_payment(dest,pay.kind,pay.source_id,(data->>'date')::date,(data->>'account')::uuid,(data->>'amount')::numeric,nullif(data->>'note',''));
 end if;
 after_doc:=public.transaction_snapshot(p_kind,dest);
 insert into public.transaction_changes(id,source_kind,source_id,action,replacement_id,reason,request,before_data,after_data,created_by)
 values(p_id,p_kind,p_source,p_action,case when dest<>p_source then dest end,trim(p_reason),req,before_doc,coalesce(after_doc,'{}'),auth.uid());
 return dest;
end $$;
revoke all on function public.change_transaction(uuid,text,uuid,text,date,text,jsonb) from public,anon;
grant execute on function public.change_transaction(uuid,text,uuid,text,date,text,jsonb) to authenticated;
create function public.reverse_document(p_id uuid,p_kind text,p_source uuid,p_date date,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
begin perform public.change_transaction(p_id,p_kind,p_source,'cancel',p_date,p_note,'{}'); return p_id; end $$;
revoke all on function public.reverse_document(uuid,text,uuid,date,text) from public,anon;
grant execute on function public.reverse_document(uuid,text,uuid,date,text) to authenticated;

create function public.cancel_delivery(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare e public.delivery_events%rowtype;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Isi alasan pembatalan pengiriman'; end if;
 select * into e from public.delivery_events where id=p_id for update;
 if not found then raise exception 'Catatan pengiriman tidak ditemukan'; end if;
 if e.cancelled_at is not null then return; end if;
 if exists(select 1 from public.delivery_events where sale_id=e.sale_id and cancelled_at is null and created_at>e.created_at) or
  (e.stage='sent' and exists(select 1 from public.delivery_events where sale_id=e.sale_id and cancelled_at is null and stage='received')) then raise exception 'Batalkan catatan penerimaan/pengiriman berikutnya terlebih dahulu'; end if;
 update public.delivery_events set cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancellation_reason=trim(p_reason) where id=p_id;
end $$;
revoke all on function public.cancel_delivery(uuid,text) from public,anon;
grant execute on function public.cancel_delivery(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
