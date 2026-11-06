begin;
create or replace function public.change_transaction(p_id uuid,p_kind text,p_source uuid,p_action text,p_date date,p_reason text,p_data jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
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
 if p_kind='operation' and d.kind='reversal' then raise exception 'Catatan pembatalan tidak dapat diubah'; end if;
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
   if length(coalesce(data->>'note',''))>1000 or (nullif(data->>'origin_weight','')::numeric is not null and (nullif(data->>'origin_weight','')::numeric<=0 or nullif(data->>'origin_weight','')::numeric::text in ('NaN','Infinity','-Infinity') or nullif(data->>'origin_weight','')::numeric>999999999999999.999 or nullif(data->>'origin_weight','')::numeric<>round(nullif(data->>'origin_weight','')::numeric,3))) then raise exception 'Berat asal atau catatan tidak valid'; end if;
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
   driver:=nullif(data->>'driver','')::uuid;
   if driver is not null and not exists(select 1 from public.profiles p where id=driver and active and (role='driver' or exists(select 1 from public.profile_extra_roles e where e.profile_id=p.id and role='driver'))) then raise exception 'Sopir tidak aktif'; end if;
   update public.operations o set driver_id=driver,amount=(select sum(round((i->>'quantity')::numeric*(i->>'price')::numeric,2)) from jsonb_array_elements(data->'items') i)-discount,
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

CREATE OR REPLACE FUNCTION public.save_operation_internal(p_id uuid, p_kind text, p_data jsonb, p_final boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 old public.operations%rowtype; src public.operations%rowtype; line public.operation_items%rowtype;
 item jsonb; v_product uuid; v_variant uuid; v_unit text; v_qty numeric; v_price numeric; v_weight numeric; v_dir text;
 v_date date; v_partner uuid; v_source uuid; v_account uuid; v_target uuid; v_assigned uuid; v_note text;
 v_amount numeric:=0; v_discount numeric:=0; v_total numeric:=0; v_paid numeric:=0; v_refund numeric:=0;
 v_returned numeric; v_credit numeric; v_actual numeric; v_count integer; v_in integer:=0; v_out integer:=0;
 cat public.finance_categories%rowtype; v_piece_count bigint; v_input numeric; v_output numeric; v_returned_weight numeric;
begin
 perform public.lock_operations();
 if p_kind is null or p_kind not in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer') then raise exception 'Jenis transaksi tidak valid'; end if;
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) then raise exception 'Tidak memiliki akses'; end if;
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
 v_target:=nullif(p_data->>'target','')::uuid; v_assigned:=null;
 if nullif(p_data->>'assigned','') is not null then raise exception 'Penugasan penagih tidak digunakan'; end if;
 v_note:=nullif(trim(p_data->>'note'),'');
 if v_date is null or length(coalesce(v_note,''))>1000 then raise exception 'Tanggal atau catatan tidak valid'; end if;
 if p_kind='sale' then
   if not exists(select 1 from public.partners where id=v_partner and active and is_customer) then raise exception 'Pelanggan tidak aktif'; end if;
   v_discount:=coalesce(nullif(p_data->>'discount','')::numeric,0); perform public.assert_amount(v_discount,true);
 elsif p_kind in ('adjustment','sale_return','purchase_return') and v_note is null then raise exception 'Alasan wajib diisi'; end if;
 if p_kind='sale_return' then
   select * into src from public.operations where id=v_source and kind='sale' and status='final' and reversed_by is null;
   if not found then raise exception 'Penjualan asal tidak ditemukan'; end if;
   v_partner:=src.partner_id;
 elsif p_kind='purchase_return' then
   select r.actual_weight,r.bill_amount,d.product_id,d.supplier_id into v_actual,v_total,v_product,v_partner from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id where r.id=v_source and r.reversed_by is null;
   if not found then raise exception 'Penerimaan asal tidak ditemukan'; end if;
 end if;
 if p_kind in ('finance','transfer','purchase_return') then
   v_amount:=nullif(p_data->>'amount','')::numeric; perform public.assert_amount(v_amount,p_kind='purchase_return');
 end if;
 if p_kind='finance' then
   select * into cat from public.finance_categories where code=p_data->>'category' and active;
   if not found then raise exception 'Kategori tidak valid'; end if;
   if v_note is null then raise exception 'Keterangan transaksi wajib diisi'; end if;
   if cat.code='opening_cash' then
     if not public.has_app_role(array['developer','owner']) then raise exception 'Saldo awal memerlukan pemilik'; end if;
     if exists(select 1 from public.cash_movements where account_id=v_account and source_type in ('opening','finance') and (source_type='opening' or source_id in(select id from public.operations where category='opening_cash' and status='final'))) then raise exception 'Saldo awal akun sudah dicatat'; end if;
   end if;
 elsif p_kind='transfer' then
   if v_account is null or v_target is null or v_account=v_target then raise exception 'Pilih dua akun berbeda'; end if;
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
end $function$;
create or replace function public.transaction_snapshot(p_kind text,p_source uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_kind='operation' then
  select to_jsonb(o)||jsonb_build_object('amount',o.amount::text,'discount',o.discount::text,'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',i.quantity::text,'price',i.price::text,'actual_weight',i.actual_weight::text,'product_name',p.name,'variant_name',v.name) order by i.id) from public.operation_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id where i.operation_id=o.id),'[]'::jsonb)) into result from public.operations o where id=p_source;
 elsif p_kind='receipt' then select to_jsonb(r)||jsonb_build_object('bill_amount',r.bill_amount::text,'actual_weight',r.actual_weight::text,'billing_quantity',r.billing_quantity::text,'unit_price',r.unit_price::text) into result from public.purchase_receipts r where id=p_source;
 elsif p_kind='payment' then select to_jsonb(p)||jsonb_build_object('amount',p.amount::text) into result from public.payments p where id=p_source;
 end if;
 return result;
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
   select (s->>'net_purchases')::numeric,(s->>'net_sales')::numeric into purchased,sold from (select public.business_summary(p_start,p_end) s) summary;
   result:=result||jsonb_build_object('purchases',purchased::text,'sales',sold::text);
 end if;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
