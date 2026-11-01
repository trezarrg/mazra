begin;
alter table public.operations add column driver_id uuid references public.profiles(id);
create or replace function public.can_read_operation(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operations o where o.id=p_id and (public.office_access()
 or (o.kind='production' and public.has_app_role(array['production']))
 or (o.kind='sale' and ((o.assigned_to=auth.uid() and public.has_app_role(array['collector'])) or (coalesce(o.driver_id,o.assigned_to)=auth.uid() and public.has_app_role(array['driver']))))
 or (o.kind='deposit' and o.created_by=auth.uid() and public.has_app_role(array['collector']))))
$$;
create policy driver_partner_read on public.partners for select to authenticated using(exists(select 1 from public.operations o where o.partner_id=partners.id and public.can_read_operation(o.id)));
create policy driver_product_read on public.products for select to authenticated using(exists(select 1 from public.operation_items i where i.product_id=products.id and public.can_read_operation(i.operation_id)));
create policy driver_variant_read on public.product_variants for select to authenticated using(exists(select 1 from public.operation_items i where i.variant_id=product_variants.id and public.can_read_operation(i.operation_id)));

-- Petugas timbang mencatat angka fisik tanpa memperoleh harga dan tagihan supplier.
create table public.receipt_measurements (
 id uuid primary key, do_id uuid not null references public.purchase_dos(id), measurement_date date not null,
 origin_weight numeric(18,3), actual_weight numeric(18,3) not null check(actual_weight>0), note text,
 status text not null default 'pending' check(status in ('pending','accepted','cancelled')),
 receipt_id uuid unique references public.purchase_receipts(id), cancellation_reason text,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.receipt_measurements enable row level security;
revoke all on public.receipt_measurements from public,anon,authenticated;
grant select on public.receipt_measurements to authenticated;
create policy measurements_read on public.receipt_measurements for select to authenticated using(public.office_access() or public.has_app_role(array['production']));
create trigger audit_measurements after insert or update on public.receipt_measurements for each row execute function public.audit_master_change();
create index measurement_do_idx on public.receipt_measurements(do_id,status);

create function public.receiving_tasks() returns table(id uuid,document_no bigint,purchase_date date,origin text,product_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 return query select d.id,d.document_no,d.purchase_date,d.origin,p.name from public.purchase_dos d join public.products p on p.id=d.product_id where d.status='open' order by d.purchase_date desc,d.document_no desc limit 1000;
end $$;
revoke all on function public.receiving_tasks() from public,anon;
grant execute on function public.receiving_tasks() to authenticated;
create function public.record_measurement(p_id uuid,p_do uuid,p_date date,p_origin numeric,p_actual numeric,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.receipt_measurements%rowtype;
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_id is null or p_date is null or p_actual is null or p_actual::text in ('NaN','Infinity','-Infinity') or p_actual<=0 or p_actual>999999999999999.999 or p_actual<>round(p_actual,3) or (p_origin is not null and (p_origin<=0 or p_origin>999999999999999.999 or p_origin<>round(p_origin,3))) or length(coalesce(p_note,''))>1000 then raise exception 'Hasil timbang tidak valid'; end if;
 select * into r from public.receipt_measurements where id=p_id;
 if found then
  if r.created_by=auth.uid() and r.do_id=p_do and r.measurement_date=p_date and r.origin_weight is not distinct from p_origin and r.actual_weight=p_actual and r.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
  raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if not exists(select 1 from public.purchase_dos where id=p_do and status='open') then raise exception 'DO tidak tersedia atau sudah ditutup'; end if;
 insert into public.receipt_measurements(id,do_id,measurement_date,origin_weight,actual_weight,note,created_by) values(p_id,p_do,p_date,p_origin,p_actual,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $$;
revoke all on function public.record_measurement(uuid,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.record_measurement(uuid,uuid,date,numeric,numeric,text) to authenticated;
create function public.confirm_measurement(p_id uuid,p_measurement uuid,p_billing numeric,p_lump numeric,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.receipt_measurements%rowtype;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 select * into r from public.receipt_measurements where id=p_measurement for update;
 if not found or r.status='cancelled' or (r.status='accepted' and r.receipt_id is distinct from p_id) then raise exception 'Hasil timbang tidak tersedia atau sudah dikonfirmasi'; end if;
 perform public.confirm_purchase_receipt(p_id,r.do_id,r.measurement_date,r.origin_weight,r.actual_weight,p_billing,p_lump,nullif(concat_ws(' · ',r.note,nullif(trim(p_note),'')),''));
 update public.receipt_measurements set status='accepted',receipt_id=p_id where id=p_measurement;
 return p_id;
end $$;
revoke all on function public.confirm_measurement(uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.confirm_measurement(uuid,uuid,numeric,numeric,text) to authenticated;
create function public.cancel_measurement(p_id uuid,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform public.lock_operations();
 if not exists(select 1 from public.receipt_measurements where id=p_id and (public.office_access() or (public.has_app_role(array['production']) and created_by=auth.uid()))) then raise exception 'Tidak memiliki akses'; end if;
 if length(trim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Alasan wajib diisi'; end if;
 if exists(select 1 from public.receipt_measurements where id=p_id and status='accepted') then raise exception 'Penerimaan final memerlukan retur'; end if;
 update public.receipt_measurements set status='cancelled',cancellation_reason=trim(p_note) where id=p_id and status='pending';
 return p_id;
end $$;
revoke all on function public.cancel_measurement(uuid,text) from public,anon;
grant execute on function public.cancel_measurement(uuid,text) to authenticated;
create or replace function public.save_operation(p_id uuid,p_kind text,p_data jsonb,p_final boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare v_driver uuid; category text; asset public.fixed_assets%rowtype; loan text; balance numeric;
begin
 perform public.lock_operations();
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) and not (p_kind='deposit' and public.has_app_role(array['collector'])) then raise exception 'Tidak memiliki akses'; end if;
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
end $$;
create or replace function public.record_delivery(p_id uuid,p_sale uuid,p_date date,p_stage text,p_items jsonb,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; e public.delivery_events%rowtype; item jsonb; line public.operation_items%rowtype; qty numeric; prior numeric; sent numeric;
begin
 perform public.lock_operations();
 select * into d from public.operations where id=p_sale and kind='sale' and status='final';
 if not found then raise exception 'Penjualan tidak ditemukan'; end if;
 if not public.office_access() and (not public.has_app_role(array['driver']) or coalesce(d.driver_id,d.assigned_to) is distinct from auth.uid()) then raise exception 'Tidak memiliki akses'; end if;
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
create or replace view public.operation_details with(security_invoker=true) as
select id,document_no,kind,operation_date,status,partner_id,source_id,assigned_to,due_date,account_id,target_account_id,category,amount::text,discount::text,refund_amount::text,note,payload,created_by,created_at,updated_at,finalized_by,verified_by,verified_at,reversed_by,driver_id from public.operations;
notify pgrst,'reload schema';
commit;
