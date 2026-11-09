begin;
select public.lock_operations();

insert into public.unit_catalog(code,name,whole_only,active) values('set','Set',true,true) on conflict(code) do nothing;
alter table public.products add column count_unit text references public.unit_catalog(code),
 add column kg_per_count numeric(18,6), add column allow_estimates boolean not null default true,
 add column shelf_life_days integer,
 add constraint products_measurement_ratio check(kg_per_count is null or (kg_per_count>0 and kg_per_count<1000000)),
 add constraint products_shelf_life check(shelf_life_days is null or shelf_life_days between 1 and 3650);
alter table public.product_variants add column kg_per_count numeric(18,6),
 add constraint variants_measurement_ratio check(kg_per_count is null or (kg_per_count>0 and kg_per_count<1000000));

alter table public.operation_items add column weight_source text not null default 'unknown',
 add column count_source text, add column count_unit text references public.unit_catalog(code),
 add column measurement_ratio numeric, add column ratio_source text,
 add column stock_reference uuid references public.stock_movements(id),
 add constraint items_weight_source check(weight_source in ('measured','supplier','estimated','unknown')),
 add constraint items_count_source check(count_source is null or count_source in ('counted','supplier','estimated'));
alter table public.purchase_receipts add column measurement jsonb;
alter table public.receipt_measurements add column measurement jsonb;
alter table public.purchase_dos add column variant_id uuid references public.product_variants(id);
alter table public.operations add column measurement_request jsonb;

create table public.stock_measurements (
 movement_id uuid primary key references public.stock_movements(id) on delete cascade,
 item_id uuid references public.operation_items(id) on delete set null,
 count_delta bigint, count_unit text references public.unit_catalog(code),
 weight_source text not null check(weight_source in ('measured','supplier','estimated','unknown')),
 count_source text check(count_source in ('counted','supplier','estimated')),
 ratio numeric, ratio_source text,
 stock_reference uuid references public.stock_movements(id),
 reverses_movement uuid references public.stock_movements(id),
 check((count_delta is null and count_source is null) or (count_delta is not null and count_source is not null and count_unit is not null))
);
create unique index stock_measurement_reversal_once on public.stock_measurements(reverses_movement) where reverses_movement is not null;
create index stock_measurement_reference on public.stock_measurements(stock_reference);
create table public.stock_count_baselines (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 variant_id uuid references public.product_variants(id), count_unit text not null references public.unit_catalog(code),
 quantity bigint not null check(quantity>=0 and quantity<=999999999), source text not null check(source in ('counted','estimated')),
 cutoff_date date not null, through_posting_order bigint not null, reason text not null check(length(trim(reason)) between 1 and 1000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create index stock_count_baseline_product on public.stock_count_baselines(product_id,variant_id,created_at desc);
alter table public.stock_measurements enable row level security;
alter table public.stock_count_baselines enable row level security;
revoke all on public.stock_measurements,public.stock_count_baselines from public,anon,authenticated;
grant select on public.stock_measurements,public.stock_count_baselines to authenticated;
create policy measurements_read on public.stock_measurements for select to authenticated using(
 public.has_app_role(array['developer','owner','admin','production']) or exists(
 select 1 from public.stock_movements m where m.id=movement_id and public.can_read_operation(m.source_id)));
create policy count_baselines_read on public.stock_count_baselines for select to authenticated using(public.has_app_role(array['developer','owner','admin','production']));
create trigger audit_count_baselines after insert on public.stock_count_baselines for each row execute function public.audit_master_change();

create function public.save_product_measured(p_id uuid,p_name text,p_units text[],p_active boolean,p_measurement jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare dest uuid; cu text:=nullif(p_measurement->>'count_unit',''); r numeric:=nullif(p_measurement->>'kg_per_count','')::numeric; days integer:=nullif(p_measurement->>'shelf_life_days','')::integer;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if cu is not null and not exists(select 1 from public.unit_catalog where code=cu and whole_only and active) then raise exception 'Satuan jumlah harus aktif dan berupa bilangan bulat'; end if;
 if (r is not null and (r::text in ('NaN','Infinity','-Infinity') or r<=0 or r>=1000000 or r<>round(r,6) or cu is null)) or (days is not null and days not between 1 and 3650) then raise exception 'Rasio atau batas simpan tidak valid'; end if;
 if cu is not null and not('kg'=any(p_units)) then raise exception 'Produk dengan jumlah pendamping harus tetap memiliki satuan kg'; end if;
 dest:=public.save_product(p_id,p_name,case when cu is not null then array(select distinct x from unnest(p_units||array[cu]) x) else p_units end,p_active);
 update public.products set count_unit=cu,kg_per_count=r,shelf_life_days=days,allow_estimates=coalesce((p_measurement->>'allow_estimates')::boolean,true) where id=dest;
 return dest;
end $$;

create function public.save_variant_measured(p_id uuid,p_product uuid,p_name text,p_active boolean,p_ratio numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare dest uuid:=coalesce(p_id,gen_random_uuid());
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or (p_ratio is not null and (p_ratio::text in ('NaN','Infinity','-Infinity') or p_ratio<=0 or p_ratio>=1000000 or p_ratio<>round(p_ratio,6))) then raise exception 'Nama varian atau rasio tidak valid'; end if;
 if p_ratio is not null and not exists(select 1 from public.products where id=p_product and count_unit is not null) then raise exception 'Atur satuan jumlah produk terlebih dahulu'; end if;
 if p_id is not null and not exists(select 1 from public.product_variants where id=p_id and product_id=p_product) then raise exception 'Varian tidak ditemukan'; end if;
 insert into public.product_variants(id,product_id,name,active,kg_per_count) values(dest,p_product,trim(p_name),p_active,p_ratio)
 on conflict(id) do update set name=excluded.name,active=excluded.active,kg_per_count=excluded.kg_per_count;
 return dest;
end $$;

-- New payloads retain resolved snapshots; the original request is retained for idempotency.
create function public.resolve_stock_measurement(p_item jsonb,p_product uuid,p_variant uuid,p_unit text,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 pr public.products%rowtype; kg numeric; cnt numeric; ratio numeric; ref uuid:=nullif(p_item->>'stock_reference','')::uuid;
 ws text:=coalesce(nullif(p_item->>'weight_source',''),'measured'); cs text:=nullif(p_item->>'count_source','');
 cu text; rs text:=nullif(p_item->>'ratio_source',''); refrow record; item jsonb:=p_item;
begin
 select * into pr from public.products where id=p_product;
 cu:=coalesce(pr.count_unit,nullif(item->>'count_unit',''),case when p_unit<>'kg' then p_unit else 'pcs' end);
 if not exists(select 1 from public.unit_catalog where code=cu and whole_only) then raise exception 'Satuan jumlah harus berupa bilangan bulat'; end if;
 if pr.count_unit is not null and nullif(item->>'count_unit','') is not null and item->>'count_unit'<>pr.count_unit then raise exception 'Satuan jumlah berbeda dari produk'; end if;
 if p_unit<>'kg' and p_unit<>cu then raise exception 'Satuan jual jumlah berbeda dari satuan jumlah produk'; end if;
 kg:=nullif(item->>case when p_unit='kg' then 'quantity' else 'weight' end,'')::numeric;
 cnt:=nullif(item->>case when p_unit='kg' then 'count' else 'quantity' end,'')::numeric;
 if ws not in ('measured','supplier','estimated') or (cs is not null and cs not in ('counted','supplier','estimated')) then raise exception 'Sumber pengukuran tidak valid'; end if;
 if cnt is not null and (cnt::text in ('NaN','Infinity','-Infinity') or cnt<=0 or cnt>999999999 or cnt<>trunc(cnt)) then raise exception 'Jumlah ekor/pcs harus bilangan bulat positif'; end if;
 ratio:=nullif(item->>'measurement_ratio','')::numeric;
 if ratio is not null and (ratio::text in ('NaN','Infinity','-Infinity') or ratio<=0 or ratio>=1000000 or ratio<>round(ratio,6)) then raise exception 'Rasio kg per jumlah tidak valid'; end if;
 if ref is not null then
  select m.*,s.ratio,s.count_unit,s.count_delta,s.weight_source,s.count_source into refrow
  from public.stock_movements m left join public.stock_measurements s on s.movement_id=m.id
  where m.id=ref and m.quantity>0 and m.product_id=p_product and m.variant_id is not distinct from p_variant
  and not exists(select 1 from public.stock_measurements rev where rev.reverses_movement=m.id);
  if not found then raise exception 'Referensi stok tidak sesuai produk atau sudah dibatalkan'; end if;
  if refrow.count_unit=cu and refrow.count_delta>0 and refrow.weight_source in ('measured','supplier') and refrow.count_source in ('counted','supplier') then
   ratio:=coalesce(ratio,round(refrow.quantity/refrow.count_delta,6)); rs:=coalesce(rs,'reference');
  end if;
 end if;
 if ratio is null then
  select kg_per_count into ratio from public.product_variants where id=p_variant and product_id=p_product;
  if ratio is not null then rs:='variant'; else ratio:=pr.kg_per_count; rs:=case when ratio is not null then 'product' end; end if;
 end if;
 if kg is null and cnt is not null then
  if ratio is null then raise exception 'Isi berat aktual (kg) atau atur rasio perkiraan terlebih dahulu'; end if;
  kg:=round(cnt*ratio,3); ws:='estimated';
 elsif cnt is null and kg is not null and cs='estimated' then
  if ratio is null then raise exception 'Rasio perkiraan belum tersedia'; end if;
  cnt:=round(kg/ratio); if cnt<=0 then raise exception 'Perkiraan jumlah kurang dari satu; isi jumlah yang benar atau kosongkan'; end if;
 end if;
 if p_kind<>'signature' and (ws='estimated' or cs='estimated') and not pr.allow_estimates then raise exception 'Produk ini memerlukan timbang dan hitung aktual'; end if;
 if p_kind<>'signature' and (ws='estimated' or cs='estimated') and coalesce(item->>'estimate_confirmed','')<>'true' then raise exception 'Konfirmasi penggunaan angka perkiraan terlebih dahulu'; end if;
 if ws='estimated' then
  if cnt is null or ratio is null or abs(kg-round(cnt*ratio,3))>0.0005 then raise exception 'Berat perkiraan tidak sesuai jumlah dan rasio'; end if;
 elsif cs='estimated' and cnt is not null then
  if ratio is null or cnt<>round(kg/ratio) then raise exception 'Jumlah perkiraan tidak sesuai berat dan rasio'; end if;
 end if;
 if ws='estimated' and cs='estimated' then raise exception 'Sedikitnya satu ukuran harus berasal dari data yang diketahui'; end if;
 if kg is null or kg::text in ('NaN','Infinity','-Infinity') or kg<=0 or kg>999999999999999.999 or kg<>round(kg,3) then raise exception 'Berat kg tidak valid'; end if;
 if cnt is not null and ws<>'estimated' and coalesce(cs,'counted')<>'estimated' then ratio:=round(kg/cnt,6); rs:='paired'; end if;
 item:=item||jsonb_build_object('count_unit',cu,'weight_source',ws,'count_source',case when cnt is null then null else coalesce(cs,'counted') end,
 'measurement_ratio',ratio,'ratio_source',rs,'stock_reference',ref);
 if p_unit='kg' then item:=item||jsonb_build_object('quantity',kg::text,'count',cnt::text);
 else item:=item||jsonb_build_object('quantity',cnt::text,'weight',kg::text,'count',cnt::text); end if;
 return item;
end $$;

create function public.capture_stock_measurement() returns trigger language plpgsql security definer set search_path='' as $$
declare
 it public.operation_items%rowtype; original record; parent uuid; op public.operations%rowtype; base public.stock_count_baselines%rowtype; signum integer;
begin
 select * into base from public.stock_count_baselines where product_id=new.product_id and variant_id is not distinct from new.variant_id order by created_at desc,id desc limit 1;
 if base.id is not null and new.movement_date<base.cutoff_date then raise exception 'Tanggal stok mendahului penetapan jumlah terakhir. Periksa opname sebelum mencatat mundur.'; end if;
 if new.source_type='reversal' then
  select * into op from public.operations where id=new.source_id; parent:=op.source_id;
  select m.id,s.* into original from public.stock_movements m left join public.stock_measurements s on s.movement_id=m.id
  where (m.source_id=parent or m.id=(select stock_movement_id from public.purchase_receipts where id=parent))
   and m.product_id=new.product_id and m.variant_id is not distinct from new.variant_id and m.unit=new.unit and m.quantity=-new.quantity
   and not exists(select 1 from public.stock_measurements x where x.reverses_movement=m.id)
  order by m.posting_order limit 1;
  if original.id is null then raise exception 'Gerakan asal pembalikan stok tidak ditemukan'; end if;
  insert into public.stock_measurements(movement_id,count_delta,count_unit,weight_source,count_source,ratio,ratio_source,stock_reference,reverses_movement)
  values(new.id,-original.count_delta,original.count_unit,coalesce(original.weight_source,'unknown'),original.count_source,original.ratio,original.ratio_source,original.stock_reference,original.id);
 else
  select * into it from public.operation_items where id=nullif(current_setting('app.stock_item',true),'')::uuid and operation_id=new.source_id;
  signum:=case when new.quantity<0 then -1 else 1 end;
  insert into public.stock_measurements(movement_id,item_id,count_delta,count_unit,weight_source,count_source,ratio,ratio_source,stock_reference)
  values(new.id,it.id,signum*it.piece_count,it.count_unit,case when it.id is null then 'unknown' else it.weight_source end,it.count_source,it.measurement_ratio,it.ratio_source,it.stock_reference);
 end if;
 return new;
end $$;
create trigger capture_stock_measurement after insert on public.stock_movements for each row execute function public.capture_stock_measurement();

create function public.receipt_stock_measurement() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.purchase_dos%rowtype; item jsonb; new_variant uuid;
begin
 select * into d from public.purchase_dos where id=new.do_id;
 new_variant:=d.variant_id;
 if exists(select 1 from public.stock_count_baselines b where b.product_id=d.product_id and b.variant_id is not distinct from new_variant and new.receipt_date<b.cutoff_date) then raise exception 'Tanggal stok mendahului penetapan jumlah terakhir. Periksa opname sebelum mencatat mundur.'; end if;
 if new.measurement is null then
  update public.stock_movements set variant_id=new_variant where id=new.stock_movement_id and variant_id is distinct from new_variant;
  return new;
 end if;
 item:=public.resolve_stock_measurement(new.measurement||jsonb_build_object('quantity',new.actual_weight::text),d.product_id,new_variant,'kg','purchase_receipt');
 if tg_op='UPDATE' and old.measurement is not null and old.measurement is distinct from new.measurement then raise exception 'Perbaiki pengukuran melalui koreksi penerimaan'; end if;
 update public.stock_movements set variant_id=new_variant where id=new.stock_movement_id and variant_id is distinct from new_variant;
 update public.stock_measurements set count_delta=nullif(item->>'count','')::bigint,count_unit=item->>'count_unit',
 weight_source=item->>'weight_source',count_source=item->>'count_source',ratio=nullif(item->>'measurement_ratio','')::numeric,ratio_source=item->>'ratio_source'
 where movement_id=new.stock_movement_id;
 return new;
end $$;
create trigger receipt_stock_measurement after insert or update of measurement on public.purchase_receipts for each row execute function public.receipt_stock_measurement();

-- The additional views preserve the legacy kg contracts used by old deployed builds.
create view public.stock_measured_balances with(security_invoker=true) as
select b.*,p.count_unit,
 case when coalesce(c.missing,0)=0 and (a.id is not null or coalesce(c.entries,0)>0) then (coalesce(a.quantity,0)+coalesce(c.total,0))::text end count_balance,
 case when coalesce(c.missing,0)>0 or (a.id is null and coalesce(c.entries,0)=0) then 'incomplete'
 when a.source='estimated' or coalesce(c.estimated,0)>0 then 'estimated' else 'known' end count_status,
 exists(select 1 from public.stock_movements wm join public.stock_measurements ws on ws.movement_id=wm.id
 where wm.product_id=b.product_id and wm.variant_id is not distinct from b.variant_id and wm.unit=b.unit and ws.weight_source='estimated' and ws.reverses_movement is null
 and not exists(select 1 from public.stock_measurements rev where rev.reverses_movement=wm.id)) weight_estimated
from public.stock_balances b join public.products p on p.id=b.product_id
left join lateral(select * from public.stock_count_baselines a where a.product_id=b.product_id and a.variant_id is not distinct from b.variant_id order by a.created_at desc,a.id desc limit 1) a on true
left join lateral(
 select count(*) entries,sum(s.count_delta) total,
 count(*) filter(where s.count_delta is null or s.count_unit is distinct from p.count_unit) missing,
 count(*) filter(where s.count_source='estimated') estimated,
 count(*) filter(where s.weight_source='estimated') weight_estimated
 from public.stock_movements m left join public.stock_measurements s on s.movement_id=m.id
 where m.product_id=b.product_id and m.variant_id is not distinct from b.variant_id and m.unit=b.unit
 and m.posting_order>coalesce(a.through_posting_order,0)
 and not exists(select 1 from public.stock_measurements rev join public.stock_movements rm on rm.id=rev.movement_id where rev.reverses_movement=m.id and rm.posting_order>coalesce(a.through_posting_order,0))
 and not exists(select 1 from public.stock_movements om where om.id=s.reverses_movement and om.posting_order>coalesce(a.through_posting_order,0))
) c on true;

create view public.stock_measured_history with(security_invoker=true) as
select h.*,s.count_delta::text,s.count_unit,s.weight_source,s.count_source,s.ratio::text,s.ratio_source,s.stock_reference,
 o.payload->>'stock_event' stock_event,o.payload->>'loss_reason' loss_reason,o.payload->>'location' location
from public.stock_history h left join public.stock_measurements s on s.movement_id=h.id left join public.operations o on o.id=h.source_id;

create view public.purchase_receipt_measured_list with(security_invoker=true) as
select l.*,r.measurement from public.purchase_receipt_list l join public.purchase_receipts r on r.id=l.id;

create view public.stock_reference_options with(security_invoker=true) as
select m.id,m.product_id,m.variant_id,m.movement_date,m.source_id,m.source_type,m.quantity::text,
 concat_ws(' · ',p.name,v.name) product_name,s.count_delta::text,s.count_unit,s.weight_source,s.count_source,
 case when s.count_delta>0 and s.weight_source in ('measured','supplier') and s.count_source in ('counted','supplier') then round(m.quantity/s.count_delta,6)::text end measured_ratio,
 p.shelf_life_days,
 case when not exists(select 1 from public.stock_movements x left join public.stock_measurements z on z.movement_id=x.id where x.product_id=m.product_id and x.variant_id is not distinct from m.variant_id and x.quantity<0 and x.posting_order>m.posting_order and z.stock_reference is null and z.reverses_movement is null)
 then (m.quantity+coalesce((select sum(x.quantity) from public.stock_movements x join public.stock_measurements z on z.movement_id=x.id where z.stock_reference=m.id),0))::text end reference_balance
from public.stock_movements m join public.products p on p.id=m.product_id left join public.product_variants v on v.id=m.variant_id
left join public.stock_measurements s on s.movement_id=m.id
where m.quantity>0 and m.unit='kg' and m.source_type in ('purchase_receipt','production','opening','opening_correction')
and not exists(select 1 from public.stock_measurements rev where rev.reverses_movement=m.id);

create function public.set_stock_count_baseline(p_id uuid,p_product uuid,p_variant uuid,p_quantity bigint,p_source text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare cu text; req public.stock_count_baselines%rowtype; posted bigint;
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Penetapan jumlah memerlukan pemilik'; end if;
 perform public.lock_operations();
 select * into req from public.stock_count_baselines where id=p_id;
 if found then
  if req.product_id=p_product and req.variant_id is not distinct from p_variant and req.quantity=p_quantity and req.source=p_source and req.reason=trim(p_reason) and req.created_by=auth.uid() then return p_id; end if;
  raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 select count_unit into cu from public.products where id=p_product and active;
 if cu is null or p_quantity is null or p_quantity<0 or p_quantity>999999999 or p_source is null or p_source not in ('counted','estimated') or length(trim(coalesce(p_reason,''))) not between 1 and 1000 or (p_variant is not null and not exists(select 1 from public.product_variants where id=p_variant and product_id=p_product)) then raise exception 'Data penetapan jumlah tidak valid'; end if;
 if p_source='estimated' and exists(select 1 from public.products where id=p_product and not allow_estimates) then raise exception 'Produk ini memerlukan hitung aktual'; end if;
 if p_quantity=0 and exists(select 1 from public.stock_balances where product_id=p_product and variant_id is not distinct from p_variant and unit='kg' and balance::numeric>0) then raise exception 'Stok kg masih ada; periksa jumlah nol sebelum menetapkan'; end if;
 select coalesce(max(posting_order),0) into posted from public.stock_movements;
 insert into public.stock_count_baselines(id,product_id,variant_id,count_unit,quantity,source,cutoff_date,through_posting_order,reason,created_by)
 values(p_id,p_product,p_variant,cu,p_quantity,p_source,(clock_timestamp() at time zone 'Asia/Jakarta')::date,posted,trim(p_reason),auth.uid());
 return p_id;
end $$;

create function public.confirm_receipt_measured(p_id uuid,p_do uuid,p_date date,p_origin_weight numeric,p_actual_weight numeric,p_billing_quantity numeric,p_lump_amount numeric,p_note text,p_measurement jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.purchase_receipts%rowtype; d public.purchase_dos%rowtype; item jsonb;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 select * into d from public.purchase_dos where id=p_do;
 if not found then raise exception 'DO tidak ditemukan'; end if;
 select * into old from public.purchase_receipts where id=p_id;
 if found and old.measurement is distinct from p_measurement then raise exception 'Penerimaan sudah digunakan dengan data berbeda'; end if;
 item:=public.resolve_stock_measurement(p_measurement||jsonb_build_object('quantity',p_actual_weight::text),d.product_id,d.variant_id,'kg','purchase_receipt');
 perform public.confirm_purchase_receipt(p_id,p_do,p_date,p_origin_weight,p_actual_weight,p_billing_quantity,p_lump_amount,p_note);
 update public.purchase_receipts set measurement=p_measurement where id=p_id and measurement is distinct from p_measurement;
 perform public.rebuild_stock_valuation();
 return p_id;
end $$;

create function public.set_purchase_variant(p_id uuid,p_variant uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if exists(select 1 from public.purchase_receipts where do_id=p_id) then raise exception 'Varian DO sudah digunakan pada penerimaan'; end if;
 if p_variant is not null and not exists(select 1 from public.product_variants v join public.purchase_dos d on d.product_id=v.product_id where d.id=p_id and v.id=p_variant and v.active) then raise exception 'Varian tidak sesuai produk DO'; end if;
 update public.purchase_dos set variant_id=p_variant where id=p_id;
end $$;

revoke all on function public.resolve_stock_measurement(jsonb,uuid,uuid,text,text),public.capture_stock_measurement(),public.receipt_stock_measurement() from public,anon,authenticated;
revoke all on function public.save_product_measured(uuid,text,text[],boolean,jsonb),public.save_variant_measured(uuid,uuid,text,boolean,numeric),public.set_stock_count_baseline(uuid,uuid,uuid,bigint,text,text),public.confirm_receipt_measured(uuid,uuid,date,numeric,numeric,numeric,numeric,text,jsonb),public.set_purchase_variant(uuid,uuid) from public,anon;
grant execute on function public.save_product_measured(uuid,text,text[],boolean,jsonb),public.save_variant_measured(uuid,uuid,text,boolean,numeric),public.set_stock_count_baseline(uuid,uuid,uuid,bigint,text,text),public.confirm_receipt_measured(uuid,uuid,date,numeric,numeric,numeric,numeric,text,jsonb),public.set_purchase_variant(uuid,uuid) to authenticated;
revoke all on public.stock_measured_balances,public.stock_measured_history,public.stock_reference_options,public.purchase_receipt_measured_list from public,anon;
grant select on public.stock_measured_balances,public.stock_measured_history,public.stock_reference_options,public.purchase_receipt_measured_list to authenticated;

-- Posting functions and guards are defined below, before the migration commits.

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
 cat public.finance_categories%rowtype; v_piece_count bigint; v_input numeric; v_output numeric; v_returned_weight numeric; v_resolved_items jsonb:='[]';
begin
 perform public.lock_operations();
 if p_kind is null or p_kind not in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer') then raise exception 'Jenis transaksi tidak valid'; end if;
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) then raise exception 'Tidak memiliki akses'; end if;
 if p_kind='adjustment' and not (coalesce(p_data->>'stock_event'='loss',false) and public.office_access()) and not public.has_app_role(array['developer','owner']) then raise exception 'Penyesuaian stok memerlukan pemilik'; end if;
 if p_id is null or p_final is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Data transaksi tidak valid'; end if;
 select * into old from public.operations where id=p_id for update;
 if found then
   if old.reversed_by is not null then raise exception 'Dokumen sudah dikoreksi'; end if;
   if old.kind<>p_kind then raise exception 'Permintaan sudah digunakan dengan data berbeda'; end if;
   if old.status<>'draft' then
     if (old.payload=p_data or old.measurement_request=p_data) and (old.created_by=auth.uid() or old.finalized_by=auth.uid()) then return p_id; end if;
     raise exception 'Dokumen final tidak dapat diubah';
   end if;
   if not public.office_access() and old.created_by<>auth.uid() then raise exception 'Tidak memiliki akses'; end if;
 end if;
 if p_data->>'stock_event'='loss' and (p_kind<>'adjustment' or p_data->>'loss_reason' is null or p_data->>'loss_reason' not in ('unloading_death','housing_death','damaged','storage_limit','other') or length(trim(coalesce(p_data->>'location',''))) not between 1 and 100) then raise exception 'Alasan dan lokasi kehilangan wajib diisi'; end if;
 v_date:=nullif(p_data->>'date','')::date; v_partner:=nullif(p_data->>'partner','')::uuid;
 v_source:=nullif(p_data->>'source','')::uuid; v_account:=nullif(p_data->>'account','')::uuid;
 v_target:=nullif(p_data->>'target','')::uuid; v_assigned:=null;
 if nullif(p_data->>'assigned','') is not null then raise exception 'Penugasan penagih tidak digunakan'; end if;
 v_note:=nullif(trim(p_data->>'note'),'');
 if v_date is null or length(coalesce(v_note,''))>1000 then raise exception 'Tanggal atau catatan tidak valid'; end if;
 if p_kind='adjustment' and p_data->>'stock_event'='loss' and not p_final then
  if v_note is null or jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Isi produk dan alasan kehilangan'; end if;
  for item in select * from jsonb_array_elements(p_data->'items') loop
   if item->>'direction' is distinct from 'out' then raise exception 'Kehilangan hanya boleh mengurangi stok'; end if;
   perform public.assert_stock((item->>'product')::uuid,nullif(item->>'variant','')::uuid,'kg',1,true);
   if nullif(item->>'count','') is not null and ((item->>'count')::numeric<=0 or (item->>'count')::numeric>999999999 or (item->>'count')::numeric<>trunc((item->>'count')::numeric)) then raise exception 'Jumlah ekor/pcs harus bilangan bulat positif'; end if;
  end loop;
  insert into public.operations(id,kind,operation_date,status,note,payload,created_by) values(p_id,p_kind,v_date,'draft',v_note,p_data,auth.uid())
  on conflict(id) do update set operation_date=excluded.operation_date,note=excluded.note,payload=excluded.payload,updated_at=clock_timestamp();
  delete from public.operation_items where operation_id=p_id;
  return p_id;
 end if;
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
     item:=public.resolve_stock_measurement(item,v_product,v_variant,v_unit,p_kind);
     if p_data->>'stock_event'='loss' and v_dir<>'out' then raise exception 'Kehilangan hanya boleh mengurangi stok'; end if;
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
     if p_kind='sale_return' and line.piece_count is not null and v_piece_count is not null and line.count_source in ('counted','supplier') then
       if v_piece_count+coalesce((select sum(i.piece_count) from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=line.id and ((o.status='final' and o.reversed_by is null) or o.id=p_id)),0)>line.piece_count then raise exception 'Jumlah retur melebihi jumlah penjualan asal'; end if;
       if v_returned+v_qty=line.quantity and not exists(select 1 from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=line.id and ((o.status='final' and o.reversed_by is null) or o.id=p_id) and i.piece_count is null)
       and v_piece_count+coalesce((select sum(i.piece_count) from public.operation_items i join public.operations o on o.id=i.operation_id where i.source_item_id=line.id and ((o.status='final' and o.reversed_by is null) or o.id=p_id)),0)<>line.piece_count then raise exception 'Retur seluruh berat harus sesuai seluruh jumlah asal. Periksa kedua ukuran.'; end if;
     end if;
     insert into public.operation_items(operation_id,product_id,variant_id,unit,quantity,price,actual_weight,direction,source_item_id,piece_count,weight_source,count_source,count_unit,measurement_ratio,ratio_source,stock_reference)
     values(p_id,v_product,v_variant,v_unit,v_qty,v_price,v_weight,v_dir,case when p_kind='sale_return' then line.id else null end,v_piece_count,item->>'weight_source',item->>'count_source',item->>'count_unit',nullif(item->>'measurement_ratio','')::numeric,item->>'ratio_source',nullif(item->>'stock_reference','')::uuid);
     v_resolved_items:=v_resolved_items||jsonb_build_array(item||jsonb_build_object('product',v_product::text,'variant',coalesce(v_variant::text,''),'unit',v_unit,'price',v_price::text,'direction',v_dir));
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
   select d.variant_id into v_variant from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id where r.id=v_source;
   item:=public.resolve_stock_measurement(p_data||jsonb_build_object('stock_reference',coalesce(nullif(p_data->>'stock_reference','')::uuid,(select stock_movement_id from public.purchase_receipts where id=v_source))),v_product,v_variant,'kg',p_kind);
   v_qty:=nullif(item->>'quantity','')::numeric;
   perform public.assert_stock(v_product,v_variant,'kg',v_qty,false);
   select coalesce(sum((payload->>'quantity')::numeric),0),coalesce(sum(amount),0) into v_returned,v_credit from public.operations where source_id=v_source and kind='purchase_return' and status='final' and reversed_by is null;
   if v_qty+v_returned>v_actual or v_amount+v_credit>v_total then raise exception 'Retur melebihi penerimaan atau tagihan asal'; end if;
   if nullif(item->>'count','') is not null and exists(select 1 from public.purchase_receipts r join public.stock_measurements s on s.movement_id=r.stock_movement_id where r.id=v_source and s.count_delta is not null and s.count_source<>'estimated' and
    (item->>'count')::numeric+coalesce((select sum(i.piece_count) from public.operation_items i join public.operations o on o.id=i.operation_id where o.source_id=v_source and o.kind='purchase_return' and o.status='final' and o.reversed_by is null),0)>s.count_delta) then raise exception 'Jumlah retur melebihi penerimaan asal'; end if;
   insert into public.operation_items(operation_id,product_id,variant_id,unit,quantity,direction,piece_count,weight_source,count_source,count_unit,measurement_ratio,ratio_source,stock_reference)
   values(p_id,v_product,v_variant,'kg',v_qty,'out',nullif(item->>'count','')::bigint,item->>'weight_source',item->>'count_source',item->>'count_unit',nullif(item->>'measurement_ratio','')::numeric,item->>'ratio_source',nullif(item->>'stock_reference','')::uuid);
   update public.operations set payload=item||jsonb_build_object('quantity',v_qty::text,'product',v_product::text,'variant',coalesce(v_variant::text,'')),measurement_request=p_data where id=p_id;
 end if;
 if p_kind in ('sale','production','adjustment','sale_return') then update public.operations set payload=jsonb_set(p_data,'{items}',v_resolved_items),measurement_request=p_data where id=p_id; end if;
 perform public.assert_amount(v_amount,true);
 update public.operations set amount=v_amount where id=p_id;
 if not p_final then return p_id; end if;
 -- Keluarkan bahan dahulu; gerakan seluruh dokumen dibatalkan bila salah satu gagal.
 for line in select * from public.operation_items where operation_id=p_id order by direction desc,id loop
   perform set_config('app.stock_item',line.id::text,true);
   perform public.move_stock(p_id,p_kind,v_date,line.product_id,line.variant_id,case when p_kind in ('sale','sale_return','production') then 'kg' else line.unit end,(case when line.direction='out' then -1 else 1 end)*(case when p_kind in ('sale','sale_return') and line.unit<>'kg' then line.actual_weight else line.quantity end),v_note);
 end loop;
 perform set_config('app.stock_item','',true);
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
  if data ? 'measurement' and (data->'measurement') is distinct from r.measurement then financial_only:=false; end if;
  if data ? 'variant' and nullif(data->>'variant','')::uuid is distinct from ord.variant_id then financial_only:=false; end if;
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
   perform public.set_purchase_variant(new_order,case when data ? 'variant' then nullif(data->>'variant','')::uuid else ord.variant_id end);
   perform public.confirm_purchase_receipt(dest,new_order,(data->>'date')::date,nullif(data->>'origin_weight','')::numeric,(data->>'actual_weight')::numeric,case when method='borongan' then null else qty end,case when method='borongan' then amount else null end,nullif(data->>'note',''));
   update public.purchase_receipts set due_date=nullif(data->>'due','')::date,measurement=case when data ? 'measurement' then data->'measurement' when (data->>'actual_weight')::numeric=r.actual_weight then r.measurement end where id=dest;
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

create or replace function public.sale_stock_signature(p_items jsonb) returns jsonb language sql stable set search_path='' as $$
 select jsonb_agg(jsonb_build_object('product',i->>'product','variant',nullif(i->>'variant',''),'unit',i->>'unit','quantity',nullif(i->>'quantity','')::numeric,'weight',nullif(i->>'weight','')::numeric,
 'count',nullif(i->>'count','')::numeric,'weight_source',i->>'weight_source','count_source',i->>'count_source',
 'count_unit',case when nullif(i->>'count','') is not null then i->>'count_unit' end,
 'measurement_ratio',case when nullif(i->>'count','') is not null then nullif(i->>'measurement_ratio','')::numeric end,
 'ratio_source',case when nullif(i->>'count','') is not null then i->>'ratio_source' end,'stock_reference',nullif(i->>'stock_reference','')) order by n)
 from (select public.resolve_stock_measurement(raw,(raw->>'product')::uuid,nullif(raw->>'variant','')::uuid,raw->>'unit','signature') i,n from jsonb_array_elements(p_items) with ordinality x(raw,n)) normalized;
$$;

create function public.guard_measured_balance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.stock_movements m join public.stock_measured_balances b on b.product_id=m.product_id and b.variant_id is not distinct from m.variant_id and b.unit=m.unit
 where m.id=new.movement_id and b.count_status='known' and b.count_balance::numeric<0) then raise exception 'Jumlah ekor/pcs stok tidak cukup. Periksa hitung fisik atau transaksi asal.'; end if;
 if new.stock_reference is not null and exists(select 1 from public.stock_reference_options where id=new.stock_reference and reference_balance::numeric<0) then raise exception 'Berat melebihi sisa referensi stok. Pilih referensi lain atau stok gabungan.'; end if;
 return new;
end $$;
create trigger guard_measured_balance after insert on public.stock_measurements for each row execute function public.guard_measured_balance();

create function public.create_do_measured(p_id uuid,p_date date,p_supplier uuid,p_product uuid,p_origin text,p_weight numeric,p_count integer,p_method text,p_price numeric,p_note text,p_variant uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if exists(select 1 from public.purchase_dos where id=p_id and variant_id is distinct from p_variant) then raise exception 'DO sudah digunakan dengan varian berbeda'; end if;
 perform public.create_purchase_do(p_id,p_date,p_supplier,p_product,p_origin,p_weight,p_count,p_method,p_price,p_note);
 if not exists(select 1 from public.purchase_receipts where do_id=p_id) then perform public.set_purchase_variant(p_id,p_variant); end if;
 return p_id;
end $$;

create function public.record_queue_measured(p_id uuid,p_do uuid,p_date date,p_origin numeric,p_actual numeric,p_note text,p_measurement jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.receipt_measurements%rowtype; d public.purchase_dos%rowtype;
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 select * into old from public.receipt_measurements where id=p_id;
 if found and old.measurement is distinct from p_measurement then raise exception 'Permintaan sudah digunakan dengan data berbeda'; end if;
 select * into d from public.purchase_dos where id=p_do;
 perform public.resolve_stock_measurement(p_measurement||jsonb_build_object('quantity',p_actual::text),d.product_id,d.variant_id,'kg','purchase_receipt');
 perform public.record_queue_measurement(p_id,p_do,p_date,p_origin,p_actual,p_note);
 update public.receipt_measurements set measurement=p_measurement where id=p_id;
 return p_id;
end $$;
create function public.confirm_queue_measured(p_id uuid,p_measurement uuid,p_billing numeric,p_lump numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.receipt_measurements%rowtype;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 select * into r from public.receipt_measurements where id=p_measurement;
 perform public.confirm_measurement(p_id,p_measurement,p_billing,p_lump,p_note);
 update public.purchase_receipts set measurement=r.measurement where id=p_id and measurement is distinct from r.measurement;
 perform public.rebuild_stock_valuation();
 return p_id;
end $$;

create function public.measurement_catalog_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.lock_operations();
 if tg_table_name='products' then
  if new.count_unit is not null and not exists(select 1 from public.unit_catalog where code=new.count_unit and whole_only) then raise exception 'Satuan jumlah harus berupa bilangan bulat'; end if;
  if new.kg_per_count is not null and new.count_unit is null then raise exception 'Atur satuan jumlah produk terlebih dahulu'; end if;
  if new.count_unit is null and exists(select 1 from public.product_variants where product_id=new.id and kg_per_count is not null) then raise exception 'Varian masih memiliki rasio; pertahankan satuan jumlah produk'; end if;
  if tg_op='UPDATE' and old.count_unit is distinct from new.count_unit and
   (exists(select 1 from public.stock_movements m join public.stock_measurements s on s.movement_id=m.id where m.product_id=new.id and s.count_delta is not null and s.count_unit is distinct from new.count_unit) or exists(select 1 from public.stock_count_baselines where product_id=new.id and count_unit is distinct from new.count_unit)) then raise exception 'Satuan jumlah sudah digunakan; jangan mengubah arti riwayat stok'; end if;
 else
  if new.kg_per_count is not null and not exists(select 1 from public.products where id=new.product_id and count_unit is not null) then raise exception 'Atur satuan jumlah produk terlebih dahulu'; end if;
 end if;
 return new;
end $$;
create trigger measurement_product_guard before insert or update on public.products for each row execute function public.measurement_catalog_guard();
create trigger measurement_variant_guard before insert or update on public.product_variants for each row execute function public.measurement_catalog_guard();

-- Append measurement columns to the existing item view without changing old fields.
create or replace view public.item_details with(security_invoker=true) as
select i.id,i.operation_id,i.product_id,i.variant_id,i.unit,i.quantity::text,i.price::text,i.actual_weight::text,i.direction,p.name product_name,v.name variant_name,i.piece_count::text,
 i.weight_source,i.count_source,i.count_unit,i.measurement_ratio::text,i.ratio_source,i.stock_reference
from public.operation_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id;

revoke all on function public.guard_measured_balance(),public.measurement_catalog_guard(),public.save_operation_internal(uuid,text,jsonb,boolean),public.sale_stock_signature(jsonb) from public,anon,authenticated;
revoke all on function public.create_do_measured(uuid,date,uuid,uuid,text,numeric,integer,text,numeric,text,uuid),public.record_queue_measured(uuid,uuid,date,numeric,numeric,text,jsonb),public.confirm_queue_measured(uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.create_do_measured(uuid,date,uuid,uuid,text,numeric,integer,text,numeric,text,uuid),public.record_queue_measured(uuid,uuid,date,numeric,numeric,text,jsonb),public.confirm_queue_measured(uuid,uuid,numeric,numeric,text) to authenticated;

create function public.receiving_queue_measured()
returns table(id uuid,document_no bigint,purchase_date date,supplier_name text,product_name text,origin text,estimated_weight text,product_id uuid,variant_id uuid,count_unit text,kg_per_count text,allow_estimates boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 return query select q.*,d.product_id,d.variant_id,p.count_unit,coalesce(v.kg_per_count,p.kg_per_count)::text,p.allow_estimates from public.receiving_queue() q join public.purchase_dos d on d.id=q.id join public.products p on p.id=d.product_id left join public.product_variants v on v.id=d.variant_id;
end $$;
create function public.receiving_history_measured()
returns table(id uuid,do_id uuid,document_no bigint,supplier_name text,product_name text,measurement_date date,origin_weight text,actual_weight text,note text,status text,created_by uuid,created_at timestamptz,measurement jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 return query select h.*,case when h.status='received' then r.measurement else m.measurement end from public.receiving_history() h left join public.purchase_receipts r on r.id=h.id left join public.receipt_measurements m on m.id=h.id;
end $$;
create function public.manage_purchase_measured(p_id uuid,p_action text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 perform public.manage_purchase(p_id,p_action,p_data);
 if p_action='edit' then perform public.set_purchase_variant(p_id,nullif(p_data->>'variant','')::uuid); end if;
end $$;
revoke all on function public.receiving_queue_measured(),public.receiving_history_measured(),public.manage_purchase_measured(uuid,text,jsonb) from public,anon;
grant execute on function public.receiving_queue_measured(),public.receiving_history_measured(),public.manage_purchase_measured(uuid,text,jsonb) to authenticated;
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
   select coalesce(sum((x->>'quantity')::numeric),0) into prior from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.cancelled_at is null and ev.stage=p_stage and x->>'item'=line.id::text;
   if p_stage='sent' then sent:=line.quantity;
   else select coalesce(sum((x->>'quantity')::numeric),0) into sent from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.cancelled_at is null and ev.stage='sent' and x->>'item'=line.id::text; end if;
   if prior+qty>sent then raise exception 'Jumlah pengiriman atau penerimaan melebihi dokumen asal'; end if;
 end loop;
 insert into public.delivery_events(id,sale_id,event_date,stage,items,note,created_by) values(p_id,p_sale,p_date,p_stage,p_items,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $function$;
alter table public.delivery_events add column measurement_request jsonb;
create function public.record_delivery_measured(p_id uuid,p_sale uuid,p_date date,p_stage text,p_items jsonb,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; e public.delivery_events%rowtype; line public.operation_items%rowtype; i jsonb; resolved jsonb; entries jsonb:='[]'; kg numeric; cnt bigint; prior_kg numeric; prior_count numeric; limit_kg numeric; limit_count numeric;
begin
 if not public.office_access() and not public.has_app_role(array['driver']) then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 select * into d from public.operations where id=p_sale and kind='sale' and status='final' and reversed_by is null;
 if not found then raise exception 'Penjualan tidak tersedia'; end if;
 if not public.office_access() and d.driver_id is distinct from auth.uid() then raise exception 'Tidak memiliki akses'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Data pengiriman tidak valid'; end if;
 select * into e from public.delivery_events where id=p_id;
 if found then
  if e.created_by=auth.uid() and e.sale_id=p_sale and e.event_date=p_date and e.stage=p_stage and e.measurement_request=p_items and e.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
  raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 for i in select * from jsonb_array_elements(p_items) loop
  select * into line from public.operation_items where id=(i->>'item')::uuid and operation_id=p_sale;
  if not found then raise exception 'Item pengiriman tidak ditemukan'; end if;
  resolved:=public.resolve_stock_measurement(i,line.product_id,line.variant_id,line.unit,'delivery');
  kg:=(resolved->>case when line.unit='kg' then 'quantity' else 'weight' end)::numeric;
  cnt:=nullif(resolved->>'count','')::bigint;
  select coalesce(sum(case when line.unit='kg' then (x->>'quantity')::numeric else nullif(x->>'weight','')::numeric end),0),coalesce(sum(case when line.unit='kg' then nullif(x->>'count','')::numeric else (x->>'quantity')::numeric end),0)
  into prior_kg,prior_count from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage=p_stage and ev.cancelled_at is null and x->>'item'=line.id::text;
  if p_stage='sent' then limit_kg:=case when line.unit='kg' then line.quantity else line.actual_weight end;limit_count:=line.piece_count;
  else select coalesce(sum(case when line.unit='kg' then (x->>'quantity')::numeric else nullif(x->>'weight','')::numeric end),0),sum(case when line.unit='kg' then nullif(x->>'count','')::numeric else (x->>'quantity')::numeric end)
  into limit_kg,limit_count from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage='sent' and ev.cancelled_at is null and x->>'item'=line.id::text;end if;
  if kg+prior_kg>limit_kg then raise exception 'Berat pengiriman atau penerimaan melebihi dokumen asal'; end if;
  if cnt is not null and limit_count is not null and line.count_source is distinct from 'estimated' and cnt+prior_count>limit_count then raise exception 'Jumlah pengiriman atau penerimaan melebihi dokumen asal'; end if;
  entries:=entries||jsonb_build_array(resolved);
 end loop;
 perform public.record_delivery(p_id,p_sale,p_date,p_stage,entries,p_note);
 update public.delivery_events set measurement_request=p_items where id=p_id;
 return p_id;
end $$;
revoke all on function public.record_delivery_measured(uuid,uuid,date,text,jsonb,text) from public,anon;
grant execute on function public.record_delivery_measured(uuid,uuid,date,text,jsonb,text) to authenticated;

alter function public.processing_summary(date,date) rename to processing_summary_before_measurements;
revoke all on function public.processing_summary_before_measurements(date,date) from public,anon,authenticated;
create function public.processing_summary(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; complete boolean; estimated boolean; cu text; outputs jsonb;
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 result:=public.processing_summary_before_measurements(p_start,p_end);
 select bool_and(i.piece_count is not null and i.count_unit is not null),bool_or(i.count_source='estimated'),case when count(distinct i.count_unit)=1 then min(i.count_unit) end
 into complete,estimated,cu from public.operation_items i join public.operations o on o.id=i.operation_id
 where o.kind='production' and o.status='final' and o.reversed_by is null and i.direction='out' and (p_start is null or o.operation_date>=p_start) and (p_end is null or o.operation_date<=p_end);
 select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') into outputs from (
 select i.product_id,i.variant_id,concat_ws(' · ',p.name,v.name) name,sum(i.quantity)::text weight,sum(i.piece_count)::text piece_count,
 case when count(distinct i.count_unit)=1 then min(i.count_unit) end count_unit,
 case when bool_and(i.piece_count is not null and i.count_unit is not null) is not true or count(distinct i.count_unit)<>1 then 'incomplete' when bool_or(i.count_source='estimated') then 'estimated' else 'known' end count_status
 from public.operation_items i join public.operations o on o.id=i.operation_id join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id
 where o.kind='production' and o.status='final' and o.reversed_by is null and i.direction='in' and (p_start is null or o.operation_date>=p_start) and (p_end is null or o.operation_date<=p_end)
 group by i.product_id,i.variant_id,p.name,v.name) r;
 return result||jsonb_build_object('count_unit',cu,'count_status',case when complete is not true or cu is null then 'incomplete' when estimated then 'estimated' else 'known' end,'outputs',outputs);
end $$;
revoke all on function public.processing_summary(date,date) from public,anon;
grant execute on function public.processing_summary(date,date) to authenticated;

notify pgrst,'reload schema';
commit;
