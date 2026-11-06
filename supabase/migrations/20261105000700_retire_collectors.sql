begin;
select public.lock_operations();
lock table public.profiles,public.profile_extra_roles,public.cash_accounts,public.operations in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.profiles where role='collector')
 or exists(select 1 from public.profile_extra_roles where role='collector')
 or exists(select 1 from public.cash_accounts where account_type='collector' or holder_id is not null)
 or exists(select 1 from public.operations where kind='deposit' or assigned_to is not null)
 or exists(select 1 from public.cash_movements where source_type='deposit') then
   raise exception 'Data penagih ditemukan; periksa sebelum menerapkan penghapusan fitur';
 end if;
end $$;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('developer','owner','admin','production','driver'));
alter table public.profile_extra_roles drop constraint profile_extra_roles_role_check;
alter table public.profile_extra_roles add constraint profile_extra_roles_role_check check(role in ('owner','admin','production','driver'));
alter table public.cash_accounts drop constraint cash_accounts_account_type_check;
alter table public.cash_accounts add constraint cash_accounts_account_type_check check(account_type in ('cash','bank'));
alter table public.cash_accounts drop constraint cash_accounts_check;
alter table public.cash_accounts add constraint cash_accounts_no_holder check(holder_id is null);
alter table public.operations add constraint operations_no_collector check(kind<>'deposit' and assigned_to is null);
alter table public.cash_movements add constraint cash_movements_no_deposit check(source_type<>'deposit');

create or replace function public.can_read_operation(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operations o where o.id=p_id and (public.office_access()
 or (o.kind='production' and public.has_app_role(array['production']))
 or (o.kind='sale' and o.driver_id=auth.uid() and public.has_app_role(array['driver']))));
$$;
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
   select r.actual_weight,r.bill_amount,d.product_id,d.supplier_id into v_actual,v_total,v_product,v_partner from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id where r.id=v_source;
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

CREATE OR REPLACE FUNCTION public.save_operation(p_id uuid, p_kind text, p_data jsonb, p_final boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_driver uuid; category text; asset public.fixed_assets%rowtype; loan text; balance numeric;
begin
 perform public.lock_operations();
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) then raise exception 'Tidak memiliki akses'; end if;
 if exists(select 1 from public.operations where id=p_id and status<>'draft') then return public.save_operation_internal(p_id,p_kind,p_data,p_final); end if;
 category:=p_data->>'category';
 if p_kind='sale' then
 v_driver:=nullif(p_data->>'driver','')::uuid;
 if v_driver is not null and not exists(select 1 from public.profiles p where p.id=v_driver and p.active and (p.role='driver' or exists(select 1 from public.profile_extra_roles e where e.profile_id=p.id and e.role='driver'))) then raise exception 'Sopir tidak aktif atau peran tidak sesuai'; end if;
 end if;
 if p_kind='finance' then
   if category='fixed_asset' and length(trim(coalesce(p_data->>'asset_name',''))) not between 1 and 200 then raise exception 'Nama aset wajib diisi'; end if;
   if category='asset_sale' then
     select * into asset from public.fixed_assets where id=nullif(p_data->>'asset','')::uuid;
     if not found or asset.disposed_by is not null then raise exception 'Aset tidak tersedia'; end if;
     perform public.assert_amount(nullif(p_data->>'book_value','')::numeric,true);
     if (p_data->>'book_value')::numeric>asset.cost then raise exception 'Nilai buku melebihi harga perolehan'; end if;
   end if;
   if category in ('loan_received','loan_principal','interest') then
     loan:=trim(p_data->>'loan_reference');
     if length(coalesce(loan,'')) not between 1 and 200 then raise exception 'Referensi pinjaman wajib diisi'; end if;
     if category='loan_principal' then
       select coalesce(sum(case when o.category='loan_received' then o.amount else -o.amount end),0) into balance from public.operations o where o.kind='finance' and o.status='final' and o.reversed_by is null and o.category in ('loan_received','loan_principal') and o.payload->>'loan_reference'=loan;
       if (p_data->>'amount')::numeric>balance then raise exception 'Angsuran pokok melebihi sisa pinjaman'; end if;
     end if;
   end if;
 end if;
 perform public.save_operation_internal(p_id,p_kind,p_data,p_final);
 if p_kind='sale' then update public.operations set driver_id=v_driver where id=p_id; end if;
 if p_kind='finance' and p_final then
   if category='fixed_asset' then insert into public.fixed_assets(id,name,acquisition_date,cost) values(p_id,trim(p_data->>'asset_name'),(p_data->>'date')::date,(p_data->>'amount')::numeric);
   elsif category='asset_sale' then update public.fixed_assets set disposed_by=p_id,book_value_at_disposal=(p_data->>'book_value')::numeric where id=asset.id; end if;
 end if;
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
 else select bill_amount into v_total from public.purchase_receipts where id=p_source; end if;
 if v_total is null then raise exception 'Tagihan tidak ditemukan'; end if;
 select coalesce(sum(amount),0) into v_paid from public.payments where source_id=p_source and kind=p_kind and reversed_by is null;
 select coalesce(sum(amount-refund_amount),0) into v_credit from public.operations where source_id=p_source and kind=case when p_kind='receivable' then 'sale_return' else 'purchase_return' end and status='final' and reversed_by is null;
 if p_amount>v_total-v_paid-v_credit then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
 if not exists(select 1 from public.cash_accounts where id=p_account and account_type in ('cash','bank') and active) then raise exception 'Gunakan kas kantor atau bank'; end if;
 insert into public.payments values(p_id,p_kind,p_source,p_date,p_account,p_amount,nullif(trim(p_note),''),v_payload,auth.uid(),now());
 perform public.move_cash(p_id,'payment',p_date,p_account,case when p_kind='receivable' then p_amount else -p_amount end,p_note);
 return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.cancel_draft(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform public.lock_operations();
 if not exists(select 1 from public.operations where id=p_id and (public.office_access() or (created_by=auth.uid() and kind='production' and public.has_app_role(array['production'])))) then raise exception 'Tidak memiliki akses'; end if;
 if exists(select 1 from public.operations where id=p_id and status not in ('draft','cancelled')) then raise exception 'Dokumen final memerlukan retur atau koreksi'; end if;
 update public.operations set status='cancelled',updated_at=now() where id=p_id and status='draft';
 return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.record_delivery(p_id uuid, p_sale uuid, p_date date, p_stage text, p_items jsonb, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.operations%rowtype; e public.delivery_events%rowtype; item jsonb; line public.operation_items%rowtype; qty numeric; prior numeric; sent numeric;
begin
 perform public.lock_operations();
 select * into d from public.operations where id=p_sale and kind='sale' and status='final';
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
   select coalesce(sum((x->>'quantity')::numeric),0) into prior from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage=p_stage and x->>'item'=line.id::text;
   if p_stage='sent' then sent:=line.quantity;
   else select coalesce(sum((x->>'quantity')::numeric),0) into sent from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage='sent' and x->>'item'=line.id::text; end if;
   if prior+qty>sent then raise exception 'Jumlah pengiriman atau penerimaan melebihi dokumen asal'; end if;
 end loop;
 insert into public.delivery_events(id,sale_id,event_date,stage,items,note,created_by) values(p_id,p_sale,p_date,p_stage,p_items,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $function$;

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
 select coalesce(sum(amount) filter(where kind='sale'),0),coalesce(sum(case when kind='sale_return' then amount when kind='reversal' and payload->>'original_kind'='sale_return' then -amount else 0 end),0),coalesce(sum(case when kind='purchase_return' then amount when kind='reversal' and payload->>'original_kind'='purchase_return' then -amount else 0 end),0)
 into sales,returns,purchase_returns from public.operations where status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 select coalesce(sum(bill_amount),0) into purchases from public.purchase_receipts where (p_start is null or receipt_date>=p_start) and (p_end is null or receipt_date<=p_end);
 select coalesce(sum(case when o.kind='reversal' then -o.amount else o.amount end) filter(where c.classification='income'),0),coalesce(sum(case when o.kind='reversal' then -o.amount else o.amount end) filter(where c.classification='expense'),0) into income,expense
 from public.operations o join public.finance_categories c on c.code=o.category where o.kind in ('finance','reversal') and o.status='final' and (p_start is null or o.operation_date>=p_start) and (p_end is null or o.operation_date<=p_end);
 select coalesce(sum((case when kind='reversal' then -1 else 1 end)*(amount+coalesce(nullif(payload->>'advance_deduction','')::numeric,0))),0) into wages from public.operations where (kind='payroll' or (kind='reversal' and payload->>'original_kind'='payroll')) and status='final' and (p_start is null or operation_date>=p_start) and (p_end is null or operation_date<=p_end);
 select coalesce(sum(amount),0) into cash from public.cash_movements;
 select coalesce(sum(balance_amount) filter(where kind='receivable'),0),coalesce(sum(balance_amount) filter(where kind='payable'),0) into receivable,payable from public.obligations;
 result:=jsonb_build_object('sales',sales::text,'sales_returns',returns::text,'net_sales',(sales-returns)::text,'purchases',purchases::text,'purchase_returns',purchase_returns::text,'cash',cash::text,'collector','0','receivable',receivable::text,'payable',payable::text,'other_income',income::text,'operating_expense',expense::text,'wages',wages::text,'before_cogs',(sales-returns+income-expense-wages)::text,'report_status','Belum lengkap',
 'attention',jsonb_build_object(
  'unreceived_dos',(select count(*) from public.purchase_dos d where d.status='open' and not exists(select 1 from public.purchase_receipts r where r.do_id=d.id)),
  'weight_discrepancies',(select count(*) from public.purchase_receipts where origin_weight is not null and actual_weight<>origin_weight and discrepancy_review is null),
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

CREATE OR REPLACE FUNCTION public.provision_profile(p_email text, p_name text, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_role text;
begin
  v_role := public.current_app_role();
  if v_role is null or v_role not in ('developer','owner') then raise exception 'Tidak memiliki akses'; end if;
  if p_role not in ('developer','owner','admin','production','driver') or p_role is null
     or (p_role = 'developer' and v_role <> 'developer') or length(trim(coalesce(p_name,''))) = 0 or length(p_name) > 200 then raise exception 'Data pengguna tidak valid'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null and is_anonymous is not true;
  if v_user is null then raise exception 'Akun Auth yang terkonfirmasi tidak ditemukan'; end if;
  if exists(select 1 from public.profiles where id = v_user) then raise exception 'Profil pengguna sudah ada'; end if;
  insert into public.profiles(id,full_name,role) values (v_user, trim(p_name), p_role);
  return v_user;
end $function$;

CREATE OR REPLACE FUNCTION public.save_team_access(p_id uuid, p_name text, p_roles text[], p_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_role text; primary_role text;
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or length(trim(coalesce(p_name,''))) not between 1 and 200 or p_active is null or p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null or exists(select 1 from unnest(p_roles) r where r not in ('owner','admin','production','driver')) then raise exception 'Data pengguna tidak valid'; end if;
 select role into old_role from public.profiles where id=p_id for update;
 if old_role is null or old_role='developer' then raise exception 'Pengguna tidak dapat diubah'; end if;
 if p_id=auth.uid() and (not p_active or not ('owner'=any(p_roles))) then raise exception 'Akses pengelola sendiri tidak dapat dihapus'; end if;
 select r into primary_role from unnest(p_roles) r order by array_position(array['owner','admin','production','driver'],r) limit 1;
 update public.profiles set full_name=trim(p_name),role=primary_role,active=p_active,updated_at=now() where id=p_id;
 delete from public.profile_extra_roles where profile_id=p_id and not (role=any(p_roles) and role<>primary_role);
 insert into public.profile_extra_roles(profile_id,role) select p_id,r from (select distinct unnest(p_roles) r) roles where r<>primary_role on conflict do nothing;
 return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.add_team_access(p_email text, p_name text, p_roles text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; primary_role text;
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null or exists(select 1 from unnest(p_roles) r where r not in ('owner','admin','production','driver')) then raise exception 'Data pengguna tidak valid'; end if;
 select id into v_id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null and is_anonymous is not true;
 if v_id is null then raise exception 'Akun Auth terkonfirmasi tidak ditemukan'; end if;
 if exists(select 1 from public.profiles where id=v_id) then raise exception 'Profil pengguna sudah ada'; end if;
 select r into primary_role from unnest(p_roles) r order by array_position(array['owner','admin','production','driver'],r) limit 1;
 insert into public.profiles(id,full_name,role) values(v_id,trim(p_name),primary_role);
 insert into public.profile_extra_roles(profile_id,role) select v_id,r from (select distinct unnest(p_roles) r) roles where r<>primary_role;
 return v_id;
end $function$;

create or replace view public.sales_list with(security_invoker=true) as
select o.*,case when o.status='draft' then 'draft' when b.source_id is null then 'unavailable' when b.balance_amount<=0 then 'paid' else 'unpaid' end payment_state
from public.operation_list o left join public.obligations b on b.source_id=o.id and b.kind='receivable' where o.kind='sale';
revoke all on public.sales_list from public,anon;
grant select on public.sales_list to authenticated;

drop function if exists public.verify_deposit(uuid,boolean,text);
drop policy if exists profiles_admin_collectors on public.profiles;
drop policy if exists profiles_extra_read on public.profiles;
create policy profiles_office_read on public.profiles for select to authenticated using(public.office_access());
alter policy extra_roles_read on public.profile_extra_roles using(profile_id=auth.uid() or public.office_access());
alter policy accounts_read on public.cash_accounts using(public.office_access());
alter policy cash_accounts_extra_read on public.cash_accounts using(public.office_access());
drop policy if exists own_cash_read on public.cash_movements;
drop policy if exists assigned_partner_read on public.partners;
drop policy if exists assigned_product_read on public.products;
drop policy if exists assigned_variant_read on public.product_variants;
drop policy if exists deposit_target_read on public.cash_accounts;
revoke all on function public.save_operation_internal(uuid,text,jsonb,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
