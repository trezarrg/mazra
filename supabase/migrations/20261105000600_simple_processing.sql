begin;
-- Guard against silently changing existing physical units. No old movements are rewritten.
do $$ begin
 if exists(select 1 from public.stock_balances where unit<>'kg' and balance::numeric<>0)
 or exists(select 1 from public.operation_items i join public.operations o on o.id=i.operation_id where o.kind in ('sale','sale_return','production') and o.status='final' and i.unit<>'kg') then
   raise exception 'Data stok/transaksi non-kg memerlukan pemeriksaan sebelum migrasi';
 end if;
end $$;
alter table public.operation_items add column if not exists piece_count bigint check(piece_count>0 and piece_count<=999999999);
create or replace function public.save_operation_internal(p_id uuid,p_kind text,p_data jsonb,p_final boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare
 old public.operations%rowtype; src public.operations%rowtype; line public.operation_items%rowtype;
 item jsonb; v_product uuid; v_variant uuid; v_unit text; v_qty numeric; v_price numeric; v_weight numeric; v_dir text;
 v_date date; v_partner uuid; v_source uuid; v_account uuid; v_target uuid; v_assigned uuid; v_note text;
 v_amount numeric:=0; v_discount numeric:=0; v_total numeric:=0; v_paid numeric:=0; v_refund numeric:=0;
 v_returned numeric; v_credit numeric; v_actual numeric; v_count integer; v_in integer:=0; v_out integer:=0;
 cat public.finance_categories%rowtype; v_piece_count bigint; v_input numeric; v_output numeric; v_returned_weight numeric;
begin
 perform public.lock_operations();
 if p_kind is null or p_kind not in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer','deposit') then raise exception 'Jenis transaksi tidak valid'; end if;
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) and not (p_kind='deposit' and public.has_app_role(array['collector'])) then raise exception 'Tidak memiliki akses'; end if;
 if p_kind='adjustment' and not public.has_app_role(array['developer','owner']) then raise exception 'Penyesuaian stok memerlukan pemilik'; end if;
 if p_id is null or p_final is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Data transaksi tidak valid'; end if;
 select * into old from public.operations where id=p_id for update;
 if found then
   if old.reversed_by is not null then raise exception 'Dokumen sudah dikoreksi'; end if;
   if old.kind<>p_kind then raise exception 'Permintaan sudah digunakan dengan data berbeda'; end if;
   if old.status<>'draft' then
     if old.payload=p_data and (old.created_by=auth.uid() or old.finalized_by=auth.uid()) then return p_id; end if;
     raise exception 'Dokumen final tidak dapat diubah';
   end if;
   if not public.office_access() and old.created_by<>auth.uid() then raise exception 'Tidak memiliki akses'; end if;
 end if;
 v_date:=nullif(p_data->>'date','')::date; v_partner:=nullif(p_data->>'partner','')::uuid;
 v_source:=nullif(p_data->>'source','')::uuid; v_account:=nullif(p_data->>'account','')::uuid;
 v_target:=nullif(p_data->>'target','')::uuid; v_assigned:=nullif(p_data->>'assigned','')::uuid;
 v_note:=nullif(trim(p_data->>'note'),'');
 if v_date is null or length(coalesce(v_note,''))>1000 then raise exception 'Tanggal atau catatan tidak valid'; end if;
 if v_assigned is not null and not exists(select 1 from public.profiles p where p.id=v_assigned and p.active and (p.role in ('collector','driver') or exists(select 1 from public.profile_extra_roles e where e.profile_id=p.id and e.role in ('collector','driver')))) then raise exception 'Petugas tidak aktif atau perannya tidak sesuai'; end if;
 if p_kind='sale' then
   if not exists(select 1 from public.partners where id=v_partner and active and is_customer) then raise exception 'Pelanggan tidak aktif'; end if;
   v_discount:=coalesce(nullif(p_data->>'discount','')::numeric,0); perform public.assert_amount(v_discount,true);
 elsif p_kind in ('adjustment','sale_return','purchase_return') and v_note is null then raise exception 'Alasan wajib diisi'; end if;
 if p_kind='sale_return' then
   select * into src from public.operations where id=v_source and kind='sale' and status='final' and reversed_by is null;
   if not found then raise exception 'Penjualan asal tidak ditemukan'; end if;
   v_partner:=src.partner_id;
 elsif p_kind='purchase_return' then
   select r.actual_weight,r.bill_amount,d.product_id,d.supplier_id into v_actual,v_total,v_product,v_partner from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id where r.id=v_source;
   if not found then raise exception 'Penerimaan asal tidak ditemukan'; end if;
 end if;
 if p_kind in ('finance','transfer','deposit','purchase_return') then
   v_amount:=nullif(p_data->>'amount','')::numeric; perform public.assert_amount(v_amount,p_kind='purchase_return');
 end if;
 if p_kind in ('finance','transfer') and exists(select 1 from public.cash_accounts where id in(v_account,v_target) and account_type='collector') then raise exception 'Kas penagih hanya melalui pembayaran dan setoran'; end if;
 if p_kind='finance' then
   select * into cat from public.finance_categories where code=p_data->>'category' and active;
   if not found then raise exception 'Kategori tidak valid'; end if;
   if v_note is null then raise exception 'Keterangan transaksi wajib diisi'; end if;
   if cat.code='opening_cash' then
     if not public.has_app_role(array['developer','owner']) then raise exception 'Saldo awal memerlukan pemilik'; end if;
     if exists(select 1 from public.cash_movements where account_id=v_account and source_type in ('opening','finance') and (source_type='opening' or source_id in(select id from public.operations where category='opening_cash' and status='final'))) then raise exception 'Saldo awal akun sudah dicatat'; end if;
   end if;
 elsif p_kind in ('transfer','deposit') then
   if v_account is null or v_target is null or v_account=v_target then raise exception 'Pilih dua akun berbeda'; end if;
   if p_kind='deposit' then
     if not exists(select 1 from public.cash_accounts where id=v_account and account_type='collector' and holder_id=auth.uid() and active) then raise exception 'Setoran hanya dari kas penagih sendiri'; end if;
     if not exists(select 1 from public.cash_accounts where id=v_target and account_type in ('cash','bank') and active) then raise exception 'Tujuan setoran harus kas kantor atau bank'; end if;
   end if;
 end if;
 insert into public.operations(id,kind,operation_date,status,partner_id,source_id,assigned_to,due_date,account_id,target_account_id,category,amount,discount,note,payload,created_by)
 values(p_id,p_kind,v_date,'draft',v_partner,v_source,v_assigned,nullif(p_data->>'due','')::date,v_account,v_target,case when p_kind='finance' then cat.code else null end,0,v_discount,v_note,p_data,auth.uid())
 on conflict(id) do update set operation_date=excluded.operation_date,partner_id=excluded.partner_id,source_id=excluded.source_id,assigned_to=excluded.assigned_to,due_date=excluded.due_date,account_id=excluded.account_id,target_account_id=excluded.target_account_id,category=excluded.category,discount=excluded.discount,note=excluded.note,payload=excluded.payload,updated_at=now();
 delete from public.operation_items where operation_id=p_id;
 if p_kind in ('sale','production','adjustment','sale_return') then
   if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Isi sedikitnya satu item, maksimal 100'; end if;
   v_amount:=0;
   for item in select * from jsonb_array_elements(p_data->'items') loop
     if p_kind='sale_return' then
       select * into line from public.operation_items where id=(item->>'source_item')::uuid and operation_id=v_source;
       if not found then raise exception 'Item asal tidak ditemukan'; end if;
       v_product:=line.product_id; v_variant:=line.variant_id; v_unit:=line.unit; v_price:=line.price; v_dir:='in';
     else
       v_product:=(item->>'product')::uuid; v_variant:=nullif(item->>'variant','')::uuid; v_unit:=item->>'unit';
       v_price:=case when p_kind='sale' then (item->>'price')::numeric else 0 end;
       v_dir:=case when p_kind='sale' then 'out' else item->>'direction' end;
     end if;
     v_qty:=(item->>'quantity')::numeric; v_weight:=nullif(item->>'weight','')::numeric;
     perform public.assert_stock(v_product,v_variant,v_unit,v_qty,p_kind<>'sale_return');
     perform public.assert_amount(v_price,true);
     if nullif(item->>'count','') is not null and ((item->>'count')::numeric<=0 or (item->>'count')::numeric>999999999 or (item->>'count')::numeric<>trunc((item->>'count')::numeric)) then raise exception 'Jumlah ekor/pcs harus bilangan bulat positif'; end if;
     v_piece_count:=nullif(item->>'count','')::numeric::bigint;
     if p_kind in ('sale','sale_return') then
       if v_unit='kg' then v_weight:=null;
       else
         if v_weight is null then raise exception 'Isi berat aktual (kg) untuk transaksi per ekor/pcs'; end if;
         if v_qty<>trunc(v_qty) then raise exception 'Jumlah ekor/pcs harus bilangan bulat'; end if;
         perform public.assert_stock(v_product,v_variant,'kg',v_weight,p_kind<>'sale_return');
       end if;
     end if;
     if v_weight is not null and (v_weight<=0 or v_weight::text in ('NaN','Infinity','-Infinity') or v_weight>999999999999999.999 or v_weight<>round(v_weight,3)) then raise exception 'Berat aktual tidak valid'; end if;
     if v_dir is null or v_dir not in ('in','out') then raise exception 'Arah stok tidak valid'; end if;
     if v_dir='in' then v_in:=v_in+1; else v_out:=v_out+1; end if;
     if p_kind in ('production','adjustment') and v_unit<>'kg' then raise exception 'Bahan dan hasil potong dicatat dalam kg'; end if;
     if p_kind='sale_return' then
       select coalesce(sum(i.quantity),0) into v_returned from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=line.id and ((o.status='final' and o.reversed_by is null) or o.id=p_id);
       if v_returned+v_qty>line.quantity then raise exception 'Retur melebihi jumlah item asal'; end if;
       if v_unit<>'kg' then
         select coalesce(sum(i.actual_weight),0) into v_returned_weight from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=line.id and ((o.status='final' and o.reversed_by is null) or o.id=p_id);
         if v_returned_weight+v_weight>line.actual_weight then raise exception 'Berat retur melebihi berat penjualan asal'; end if;
         if v_returned+v_qty=line.quantity and v_returned_weight+v_weight<>line.actual_weight then raise exception 'Retur seluruh sisa item harus mengembalikan seluruh sisa berat asal'; end if;
       end if;
     end if;
     insert into public.operation_items(operation_id,product_id,variant_id,unit,quantity,price,actual_weight,direction,source_item_id,piece_count)
     values(p_id,v_product,v_variant,v_unit,v_qty,v_price,v_weight,v_dir,case when p_kind='sale_return' then line.id else null end,v_piece_count);
     v_amount:=v_amount+round(v_qty*v_price,2);
   end loop;
   if p_kind='production' then
     if v_out<>1 or v_in=0 then raise exception 'Isi satu bahan dan sedikitnya satu hasil potong'; end if;
     select sum(quantity) filter(where direction='out'),sum(quantity) filter(where direction='in') into v_input,v_output from public.operation_items where operation_id=p_id;
     if v_output>v_input then raise exception 'Total berat hasil tidak boleh melebihi berat bahan'; end if;
   end if;
   if p_kind='production' and exists(select 1 from public.operation_items a join public.operation_items b on a.product_id=b.product_id and a.variant_id is not distinct from b.variant_id and a.unit=b.unit and a.direction<>b.direction where a.operation_id=p_id and b.operation_id=p_id) then raise exception 'Bahan dan hasil produksi harus berbeda'; end if;
   if p_kind='sale' then
     if v_discount>v_amount then raise exception 'Diskon melebihi nilai penjualan'; end if;
     v_amount:=v_amount-v_discount;
   elsif p_kind='sale_return' then
     select sum(round(quantity*price,2)) into v_total from public.operation_items where operation_id=v_source;
     -- Alokasi diskon mengikuti proporsi item; retur terakhir mengambil sisa pembulatan.
     v_amount:=case when v_total=0 then 0 else round(v_amount*src.amount/v_total,2) end;
     select coalesce(sum(amount),0) into v_credit from public.operations where source_id=v_source and kind='sale_return' and status='final' and reversed_by is null;
     if not exists(select 1 from public.operation_items s where s.operation_id=v_source and s.quantity>(select coalesce(sum(i.quantity),0) from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=s.id and ((o.status='final' and o.reversed_by is null) or o.id=p_id))) then v_amount:=src.amount-v_credit; end if;
     v_amount:=least(v_amount,src.amount-v_credit);
   end if;
 end if;
 if p_kind='purchase_return' then
   v_qty:=nullif(p_data->>'quantity','')::numeric;
   perform public.assert_stock(v_product,null,'kg',v_qty,false);
   select coalesce(sum((payload->>'quantity')::numeric),0),coalesce(sum(amount),0) into v_returned,v_credit from public.operations where source_id=v_source and kind='purchase_return' and status='final' and reversed_by is null;
   if v_qty+v_returned>v_actual or v_amount+v_credit>v_total then raise exception 'Retur melebihi penerimaan atau tagihan asal'; end if;
   insert into public.operation_items(operation_id,product_id,unit,quantity,direction) values(p_id,v_product,'kg',v_qty,'out');
 end if;
 perform public.assert_amount(v_amount,true);
 update public.operations set amount=v_amount where id=p_id;
 if not p_final then return p_id; end if;
 if p_kind='deposit' then
   if coalesce((select sum(amount) from public.cash_movements where account_id=v_account),0)-coalesce((select sum(amount) from public.operations where kind='deposit' and status='pending' and account_id=v_account),0)<v_amount then raise exception 'Saldo kas penagih tidak mencukupi'; end if;
   update public.operations set status='pending',finalized_by=auth.uid() where id=p_id;
   return p_id;
 end if;
 -- Keluarkan bahan dahulu; gerakan seluruh dokumen dibatalkan bila salah satu gagal.
 for line in select * from public.operation_items where operation_id=p_id order by direction desc,id loop
   perform public.move_stock(p_id,p_kind,v_date,line.product_id,line.variant_id,case when p_kind in ('sale','sale_return','production') then 'kg' else line.unit end,(case when line.direction='out' then -1 else 1 end)*(case when p_kind in ('sale','sale_return') and line.unit<>'kg' then line.actual_weight else line.quantity end),v_note);
 end loop;
 if p_kind in ('sale_return','purchase_return') then
   select coalesce(sum(amount),0) into v_paid from public.payments where source_id=v_source and kind=case when p_kind='sale_return' then 'receivable' else 'payable' end and reversed_by is null;
   select coalesce(sum(amount-refund_amount),0) into v_credit from public.operations where source_id=v_source and kind=p_kind and status='final' and reversed_by is null;
   v_refund:=greatest(0,v_amount-(case when p_kind='sale_return' then src.amount else v_total end)-(-v_paid-v_credit));
   if v_refund>0 then
     if not exists(select 1 from public.cash_accounts where id=v_account and account_type in ('cash','bank')) then raise exception 'Pilih akun pengembalian dana untuk retur transaksi terbayar'; end if;
     perform public.move_cash(p_id,p_kind,v_date,v_account,case when p_kind='sale_return' then -v_refund else v_refund end,v_note);
   end if;
   update public.operations set refund_amount=v_refund where id=p_id;
 elsif p_kind='finance' then
   perform public.move_cash(p_id,p_kind,v_date,v_account,case when cat.direction='in' then v_amount else -v_amount end,v_note);
 elsif p_kind='transfer' then
   perform public.move_cash(p_id,p_kind,v_date,v_account,-v_amount,v_note);
   perform public.move_cash(p_id,p_kind,v_date,v_target,v_amount,v_note);
 end if;
 update public.operations set status='final',finalized_by=auth.uid() where id=p_id;
 if p_kind='sale' then
   v_paid:=coalesce(nullif(p_data->>'paid','')::numeric,0); perform public.assert_amount(v_paid,true);
   if v_paid>0 then perform public.post_payment(p_id,'receivable',p_id,v_date,v_account,v_paid,'Pembayaran awal penjualan'); end if;
 end if;
 return p_id;
end $$;

create or replace view public.item_details with(security_invoker=true) as
select i.id,i.operation_id,i.product_id,i.variant_id,i.unit,i.quantity::text,i.price::text,i.actual_weight::text,i.direction,p.name product_name,v.name variant_name,i.piece_count::text
from public.operation_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id;

create or replace view public.processing_list with(security_invoker=true) as
select o.id,o.document_no,o.operation_date,o.created_at,o.status,o.reversed_by,o.search_text,
 coalesce(s.input_weight,0)::text input_weight,coalesce(s.output_weight,0)::text output_weight,
 s.piece_count::text piece_count,s.input_name
from public.operation_list o
left join lateral (
 select sum(i.quantity) filter(where i.direction='out') input_weight,
 sum(i.quantity) filter(where i.direction='in') output_weight,
 sum(i.piece_count) filter(where i.direction='out') piece_count,
 max(p.name) filter(where i.direction='out') input_name
 from public.operation_items i join public.products p on p.id=i.product_id where i.operation_id=o.id
) s on true where o.kind='production';
revoke all on public.processing_list from public,anon;
grant select on public.processing_list to authenticated;

create or replace function public.processing_options() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('key',c.product::text||':'||coalesce(c.variant::text,''),'product',c.product,'variant',coalesce(c.variant::text,''),'label',c.label,'balance',coalesce(b.balance,'0')) order by c.label),'[]'::jsonb)
 from (
   select p.id product,null::uuid variant,p.name label from public.products p where p.active
   union all
   select p.id,v.id,p.name||' · '||v.name from public.products p join public.product_variants v on v.product_id=p.id where p.active and v.active
 ) c join public.product_units u on u.product_id=c.product and u.unit='kg'
 join public.unit_catalog unit on unit.code=u.unit and unit.active
 left join public.stock_balances b on b.product_id=c.product and b.variant_id is not distinct from c.variant and b.unit='kg');
end $$;

create or replace function public.processing_summary(p_start date,p_end date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; purchased numeric; sold numeric;
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 if p_start is not null and p_end is not null and p_start>p_end then raise exception 'Periode tidak valid'; end if;
 select jsonb_build_object('process_count',count(*),'input_weight',coalesce(sum(input_weight::numeric),0)::text,
 'output_weight',coalesce(sum(output_weight::numeric),0)::text,'piece_count',sum(piece_count::numeric)::text)
 into result from public.processing_list where status='final' and reversed_by is null
 and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 result:=result||jsonb_build_object('outputs',(
   select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]'::jsonb) from (
     select i.product_id,i.variant_id,concat_ws(' · ',p.name,v.name) name,sum(i.quantity)::text weight,sum(i.piece_count)::text piece_count
     from public.operation_items i join public.operations o on o.id=i.operation_id join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id
     where o.kind='production' and o.status='final' and o.reversed_by is null and i.direction='in'
     and (p_start is null or o.operation_date>=p_start) and (p_end is null or o.operation_date<=p_end)
     group by i.product_id,i.variant_id,p.name,v.name
   ) r));
 if public.office_access() then
   select coalesce(sum(bill_amount),0) into purchased from public.purchase_receipts where (p_start is null or receipt_date>=p_start) and (p_end is null or receipt_date<=p_end);
   select coalesce(sum(amount),0) into sold from public.operations where kind='sale' and status='final' and reversed_by is null and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
   result:=result||jsonb_build_object('purchases',purchased::text,'sales',sold::text);
 end if;
 return result;
end $$;
revoke all on function public.processing_options(),public.processing_summary(date,date) from public,anon;
grant execute on function public.processing_options(),public.processing_summary(date,date) to authenticated;
create or replace view public.stock_history with(security_invoker=true) as
select m.id,m.quantity::text quantity,m.unit,m.movement_date,m.created_at,p.name product_name,v.name variant_name,m.source_type,m.product_id,m.variant_id,m.source_id
from public.stock_movements m join public.products p on p.id=m.product_id left join public.product_variants v on v.id=m.variant_id;
revoke all on function public.save_operation_internal(uuid,text,jsonb,boolean) from public,anon,authenticated;
commit;
