begin;
alter table public.stock_movements drop constraint stock_movements_source_type_check;
alter table public.stock_movements add constraint stock_movements_source_type_check check (source_type in ('opening','opening_correction','purchase_receipt'));

create table public.purchase_dos (
 id uuid primary key,
 document_no bigint generated always as identity unique,
 purchase_date date not null,
 supplier_id uuid not null references public.partners(id),
 product_id uuid not null references public.products(id),
 origin text,
 estimated_weight numeric(18,3),
 estimated_count integer,
 price_method text not null check (price_method in ('kg','ekor','borongan')),
 price numeric(20,2) not null check (price >= 0),
 note text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.purchase_receipts (
 id uuid primary key,
 do_id uuid not null references public.purchase_dos(id),
 receipt_date date not null,
 origin_weight numeric(18,3),
 actual_weight numeric(18,3) not null check (actual_weight > 0),
 billing_quantity numeric(18,3),
 bill_amount numeric(20,2) not null check (bill_amount >= 0),
 note text,
 stock_movement_id uuid not null unique references public.stock_movements(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index purchase_receipts_do_idx on public.purchase_receipts(do_id);
create trigger audit_purchase_dos after insert on public.purchase_dos for each row execute function public.audit_master_change();
create trigger audit_purchase_receipts after insert on public.purchase_receipts for each row execute function public.audit_master_change();
alter table public.purchase_dos enable row level security;
alter table public.purchase_receipts enable row level security;
revoke all on public.purchase_dos, public.purchase_receipts from public, anon, authenticated;
grant select on public.purchase_dos, public.purchase_receipts to authenticated;
create policy purchase_dos_read on public.purchase_dos for select to authenticated using (public.has_app_role(array['developer','owner','admin']));
create policy purchase_receipts_read on public.purchase_receipts for select to authenticated using (public.has_app_role(array['developer','owner','admin']));

create function public.create_purchase_do(p_id uuid, p_date date, p_supplier uuid, p_product uuid, p_origin text, p_weight numeric, p_count integer, p_method text, p_price numeric, p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.purchase_dos%rowtype;
begin
 if not public.has_app_role(array['developer','owner','admin']) then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or p_date is null or p_supplier is null or p_product is null or p_method is null or p_method not in ('kg','ekor','borongan') or p_price is null or p_price < 0 or p_price > 999999999999999.99 or p_price <> round(p_price,2)
    or (p_weight is not null and (p_weight <= 0 or p_weight > 999999999999999.999 or p_weight <> round(p_weight,3))) or (p_count is not null and p_count <= 0)
    or length(coalesce(p_origin,'')) > 200 or length(coalesce(p_note,'')) > 1000 then raise exception 'Data DO tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.purchase_dos where id=p_id;
 if found then
   if existing.created_by=auth.uid() and existing.purchase_date=p_date and existing.supplier_id=p_supplier and existing.product_id=p_product and existing.origin is not distinct from nullif(trim(p_origin),'') and existing.estimated_weight is not distinct from p_weight and existing.estimated_count is not distinct from p_count and existing.price_method=p_method and existing.price=p_price and existing.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
   raise exception 'DO sudah digunakan dengan data berbeda';
 end if;
 if not exists(select 1 from public.partners where id=p_supplier and active and is_supplier) or not exists(select 1 from public.products p join public.product_units u on u.product_id=p.id join public.unit_catalog c on c.code=u.unit where p.id=p_product and p.active and u.unit='kg' and c.active) then raise exception 'Supplier atau produk dengan satuan kg tidak aktif'; end if;
 insert into public.purchase_dos(id,purchase_date,supplier_id,product_id,origin,estimated_weight,estimated_count,price_method,price,note,created_by)
 values(p_id,p_date,p_supplier,p_product,nullif(trim(p_origin),''),p_weight,p_count,p_method,p_price,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $$;
revoke all on function public.create_purchase_do(uuid,date,uuid,uuid,text,numeric,integer,text,numeric,text) from public, anon;
grant execute on function public.create_purchase_do(uuid,date,uuid,uuid,text,numeric,integer,text,numeric,text) to authenticated;

create function public.confirm_purchase_receipt(p_id uuid, p_do uuid, p_date date, p_origin_weight numeric, p_actual_weight numeric, p_billing_quantity numeric, p_lump_amount numeric, p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.purchase_dos%rowtype; r public.purchase_receipts%rowtype; v_amount numeric; v_movement uuid;
begin
 if not public.has_app_role(array['developer','owner','admin']) then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or p_do is null or p_date is null or p_actual_weight is null or p_actual_weight <= 0 or p_actual_weight > 999999999999999.999 or p_actual_weight <> round(p_actual_weight,3)
   or (p_origin_weight is not null and (p_origin_weight <= 0 or p_origin_weight > 999999999999999.999 or p_origin_weight <> round(p_origin_weight,3))) or length(coalesce(p_note,'')) > 1000 then raise exception 'Data penerimaan tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into d from public.purchase_dos where id=p_do for update;
 if not found then raise exception 'DO tidak ditemukan'; end if;
 if d.price_method='borongan' then
   if p_billing_quantity is not null or p_lump_amount is null or p_lump_amount < 0 or p_lump_amount > 999999999999999.99 or p_lump_amount <> round(p_lump_amount,2) then raise exception 'Nominal tagihan borongan tidak valid'; end if;
   v_amount := p_lump_amount;
 else
   if p_lump_amount is not null or p_billing_quantity is null or p_billing_quantity <= 0 or p_billing_quantity > 999999999999999.999 or p_billing_quantity <> round(p_billing_quantity,3) or (d.price_method='ekor' and p_billing_quantity <> trunc(p_billing_quantity)) then raise exception 'Dasar tagihan tidak valid'; end if;
   v_amount := round(p_billing_quantity*d.price,2);
   if v_amount > 999999999999999.99 then raise exception 'Nilai tagihan terlalu besar'; end if;
 end if;
 select * into r from public.purchase_receipts where id=p_id;
 if found then
   if r.created_by=auth.uid() and r.do_id=p_do and r.receipt_date=p_date and r.origin_weight is not distinct from p_origin_weight and r.actual_weight=p_actual_weight and r.billing_quantity is not distinct from p_billing_quantity and r.bill_amount=v_amount and r.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
   raise exception 'Penerimaan sudah digunakan dengan data berbeda';
 end if;
 if d.price_method='borongan' and coalesce((select sum(bill_amount) from public.purchase_receipts where do_id=p_do),0) + v_amount > d.price then raise exception 'Total tagihan borongan melebihi harga DO'; end if;
 insert into public.stock_movements(product_id,variant_id,unit,quantity,movement_date,source_type,note,created_by) values(d.product_id,null,'kg',p_actual_weight,p_date,'purchase_receipt',nullif(trim(p_note),''),auth.uid()) returning id into v_movement;
 insert into public.purchase_receipts(id,do_id,receipt_date,origin_weight,actual_weight,billing_quantity,bill_amount,note,stock_movement_id,created_by) values(p_id,p_do,p_date,p_origin_weight,p_actual_weight,p_billing_quantity,v_amount,nullif(trim(p_note),''),v_movement,auth.uid());
 return p_id;
end $$;
revoke all on function public.confirm_purchase_receipt(uuid,uuid,date,numeric,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.confirm_purchase_receipt(uuid,uuid,date,numeric,numeric,numeric,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
