begin;
create function public.save_operation(p_id uuid,p_kind text,p_data jsonb,p_final boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare
 old public.operations%rowtype; src public.operations%rowtype; line public.operation_items%rowtype;
 item jsonb; v_product uuid; v_variant uuid; v_unit text; v_qty numeric; v_price numeric; v_weight numeric; v_dir text;
 v_date date; v_partner uuid; v_source uuid; v_account uuid; v_target uuid; v_assigned uuid; v_note text;
 v_amount numeric:=0; v_discount numeric:=0; v_total numeric:=0; v_paid numeric:=0; v_refund numeric:=0;
 v_returned numeric; v_credit numeric; v_actual numeric; v_count integer; v_in integer:=0; v_out integer:=0;
 cat public.finance_categories%rowtype;
begin
 perform public.lock_operations();
 if p_kind is null or p_kind not in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer','deposit') then raise exception 'Jenis transaksi tidak valid'; end if;
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) and not (p_kind='deposit' and public.has_app_role(array['collector'])) then raise exception 'Tidak memiliki akses'; end if;
 if p_kind='adjustment' and not public.has_app_role(array['developer','owner']) then raise exception 'Penyesuaian stok memerlukan pemilik'; end if;
 if p_id is null or p_final is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Data transaksi tidak valid'; end if;
 select * into old from public.operations where id=p_id for update;
 if found then
   if old.kind<>p_kind then raise exception 'Permintaan sudah digunakan dengan data berbeda'; end if;
   if old.status<>'draft' then
     if old.payload=p_data and old.created_by=auth.uid() then return p_id; end if;
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
   select * into src from public.operations where id=v_source and kind='sale' and status='final';
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
     if v_weight is not null and (v_weight<=0 or v_weight::text in ('NaN','Infinity','-Infinity') or v_weight>999999999999999.999 or v_weight<>round(v_weight,3)) then raise exception 'Berat aktual tidak valid'; end if;
     if v_dir is null or v_dir not in ('in','out') then raise exception 'Arah stok tidak valid'; end if;
     if v_dir='in' then v_in:=v_in+1; else v_out:=v_out+1; end if;
     if p_kind='production' and v_unit<>'kg' and v_weight is null then raise exception 'Produksi satuan ekor/pcs memerlukan hasil timbang aktual'; end if;
     if p_kind='sale_return' then
       select coalesce(sum(i.quantity),0) into v_returned from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=line.id and (o.status='final' or o.id=p_id);
       if v_returned+v_qty>line.quantity then raise exception 'Retur melebihi jumlah item asal'; end if;
     end if;
     insert into public.operation_items(operation_id,product_id,variant_id,unit,quantity,price,actual_weight,direction,source_item_id)
     values(p_id,v_product,v_variant,v_unit,v_qty,v_price,v_weight,v_dir,case when p_kind='sale_return' then line.id else null end);
     v_amount:=v_amount+round(v_qty*v_price,2);
   end loop;
   if p_kind='production' and (v_in=0 or v_out=0) then raise exception 'Produksi memerlukan bahan dan hasil aktual'; end if;
   if p_kind='production' and exists(select 1 from public.operation_items a join public.operation_items b on a.product_id=b.product_id and a.variant_id is not distinct from b.variant_id and a.unit=b.unit and a.direction<>b.direction where a.operation_id=p_id and b.operation_id=p_id) then raise exception 'Bahan dan hasil produksi harus berbeda'; end if;
   if p_kind='sale' then
     if v_discount>v_amount then raise exception 'Diskon melebihi nilai penjualan'; end if;
     v_amount:=v_amount-v_discount;
   elsif p_kind='sale_return' then
     select sum(round(quantity*price,2)) into v_total from public.operation_items where operation_id=v_source;
     -- Alokasi diskon mengikuti proporsi item; retur terakhir mengambil sisa pembulatan.
     v_amount:=case when v_total=0 then 0 else round(v_amount*src.amount/v_total,2) end;
     select coalesce(sum(amount),0) into v_credit from public.operations where source_id=v_source and kind='sale_return' and status='final';
     if not exists(select 1 from public.operation_items s where s.operation_id=v_source and s.quantity>(select coalesce(sum(i.quantity),0) from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=s.id and (o.status='final' or o.id=p_id))) then v_amount:=src.amount-v_credit; end if;
     v_amount:=least(v_amount,src.amount-v_credit);
   end if;
 end if;
 if p_kind='purchase_return' then
   v_qty:=nullif(p_data->>'quantity','')::numeric;
   perform public.assert_stock(v_product,null,'kg',v_qty,false);
   select coalesce(sum((payload->>'quantity')::numeric),0),coalesce(sum(amount),0) into v_returned,v_credit from public.operations where source_id=v_source and kind='purchase_return' and status='final';
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
   perform public.move_stock(p_id,p_kind,v_date,line.product_id,line.variant_id,line.unit,case when line.direction='out' then -line.quantity else line.quantity end,v_note);
 end loop;
 if p_kind in ('sale_return','purchase_return') then
   select coalesce(sum(amount),0) into v_paid from public.payments where source_id=v_source and kind=case when p_kind='sale_return' then 'receivable' else 'payable' end;
   select coalesce(sum(amount-refund_amount),0) into v_credit from public.operations where source_id=v_source and kind=p_kind and status='final';
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
revoke all on function public.save_operation(uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.save_operation(uuid,text,jsonb,boolean) to authenticated;

create function public.verify_deposit(p_id uuid,p_accept boolean,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 if p_accept is null then raise exception 'Aksi tidak valid'; end if;
 perform public.lock_operations();
 select * into d from public.operations where id=p_id and kind='deposit' for update;
 if not found then raise exception 'Setoran tidak ditemukan'; end if;
 if d.created_by=auth.uid() then raise exception 'Tidak dapat memverifikasi setoran sendiri'; end if;
 if d.status=(case when p_accept then 'verified' else 'cancelled' end) then return p_id; end if;
 if d.status<>'pending' then raise exception 'Setoran sudah diproses'; end if;
 if not p_accept and length(trim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Alasan penolakan wajib diisi'; end if;
 if p_accept then
   perform public.move_cash(p_id,'deposit',d.operation_date,d.account_id,-d.amount,d.note);
   perform public.move_cash(p_id,'deposit',d.operation_date,d.target_account_id,d.amount,d.note);
 end if;
 update public.operations set status=case when p_accept then 'verified' else 'cancelled' end,verified_by=auth.uid(),verified_at=now(),payload=payload||jsonb_build_object('verification_note',p_note) where id=p_id;
 return p_id;
end $$;
revoke all on function public.verify_deposit(uuid,boolean,text) from public,anon;
grant execute on function public.verify_deposit(uuid,boolean,text) to authenticated;

create function public.cancel_draft(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform public.lock_operations();
 if not exists(select 1 from public.operations where id=p_id and (public.office_access() or (created_by=auth.uid() and kind in ('production','deposit') and public.has_app_role(array['production','collector'])))) then raise exception 'Tidak memiliki akses'; end if;
 if exists(select 1 from public.operations where id=p_id and status not in ('draft','cancelled')) then raise exception 'Dokumen final memerlukan retur atau koreksi'; end if;
 update public.operations set status='cancelled',updated_at=now() where id=p_id and status='draft';
 return p_id;
end $$;
revoke all on function public.cancel_draft(uuid) from public,anon;
grant execute on function public.cancel_draft(uuid) to authenticated;

create function public.record_delivery(p_id uuid,p_sale uuid,p_date date,p_stage text,p_items jsonb,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; e public.delivery_events%rowtype; item jsonb; line public.operation_items%rowtype; qty numeric; prior numeric; sent numeric;
begin
 perform public.lock_operations();
 select * into d from public.operations where id=p_sale and kind='sale' and status='final';
 if not found then raise exception 'Penjualan tidak ditemukan'; end if;
 if not public.office_access() and not (public.has_app_role(array['driver']) and d.assigned_to=auth.uid()) then raise exception 'Tidak memiliki akses'; end if;
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
   select coalesce(sum((x->>'quantity')::numeric),0) into prior from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage=p_stage and x->>'item'=line.id::text;
   if p_stage='sent' then sent:=line.quantity;
   else select coalesce(sum((x->>'quantity')::numeric),0) into sent from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage='sent' and x->>'item'=line.id::text; end if;
   if prior+qty>sent then raise exception 'Jumlah pengiriman atau penerimaan melebihi dokumen asal'; end if;
 end loop;
 insert into public.delivery_events(id,sale_id,event_date,stage,items,note,created_by) values(p_id,p_sale,p_date,p_stage,p_items,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $$;
revoke all on function public.record_delivery(uuid,uuid,date,text,jsonb,text) from public,anon;
grant execute on function public.record_delivery(uuid,uuid,date,text,jsonb,text) to authenticated;

-- Petugas lapangan hanya dapat membaca kontak transaksi yang ditugaskan.
create policy assigned_partner_read on public.partners for select to authenticated using(exists(select 1 from public.operations o where o.partner_id=partners.id and o.kind='sale' and o.assigned_to=auth.uid() and public.has_app_role(array['collector','driver'])));
create policy assigned_product_read on public.products for select to authenticated using(exists(select 1 from public.operation_items i join public.operations o on o.id=i.operation_id where i.product_id=products.id and o.assigned_to=auth.uid() and public.has_app_role(array['collector','driver'])));
create policy assigned_variant_read on public.product_variants for select to authenticated using(exists(select 1 from public.operation_items i join public.operations o on o.id=i.operation_id where i.variant_id=product_variants.id and o.assigned_to=auth.uid() and public.has_app_role(array['collector','driver'])));
-- Penagih dapat memilih akun tujuan, tanpa akses ke gerakan atau saldo akun kantor.
create policy deposit_target_read on public.cash_accounts for select to authenticated using(public.has_app_role(array['collector']) and active and account_type in ('cash','bank'));
notify pgrst,'reload schema';
commit;
