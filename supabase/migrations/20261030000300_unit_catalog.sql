begin;
create table public.unit_catalog (
  id uuid not null default gen_random_uuid() unique,
  code text primary key check (code ~ '^[a-z][a-z0-9_]{0,19}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  whole_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.unit_catalog(code,name,whole_only) values ('kg','Kilogram',false),('ekor','Ekor',true),('pcs','Pcs',true);
create trigger audit_unit_catalog after insert or update or delete on public.unit_catalog for each row execute function public.audit_master_change();
alter table public.unit_catalog enable row level security;
grant select, insert, update on public.unit_catalog to authenticated;
revoke all on public.unit_catalog from anon;
create policy unit_catalog_read on public.unit_catalog for select to authenticated using (public.current_app_role() is not null);
create policy unit_catalog_write on public.unit_catalog for all to authenticated using (public.current_app_role() in ('developer','owner','admin')) with check (public.current_app_role() in ('developer','owner','admin'));
create function public.guard_unit_catalog() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.code is distinct from old.code or new.whole_only is distinct from old.whole_only then raise exception 'Kode dan jenis satuan tidak dapat diubah'; end if;
 return new;
end $$;
revoke all on function public.guard_unit_catalog() from public, anon, authenticated;
create trigger guard_unit_catalog before update on public.unit_catalog for each row execute function public.guard_unit_catalog();
alter table public.product_units drop constraint product_units_unit_check;
alter table public.product_units add constraint product_units_catalog_fkey foreign key (unit) references public.unit_catalog(code);
alter table public.stock_movements drop constraint stock_movements_unit_check;
alter table public.stock_movements add constraint stock_movements_unit_catalog_fkey foreign key (unit) references public.unit_catalog(code);
create function public.guard_stock_unit_quantity() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if exists (select 1 from public.unit_catalog where code=new.unit and whole_only) and new.quantity <> trunc(new.quantity) then
   raise exception 'Jumlah untuk satuan ini harus bilangan bulat';
 end if;
 return new;
end $$;
revoke all on function public.guard_stock_unit_quantity() from public, anon, authenticated;
create trigger guard_stock_unit_quantity before insert or update on public.stock_movements for each row execute function public.guard_stock_unit_quantity();
create or replace function public.save_product(p_id uuid, p_name text, p_units text[], p_active boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('developer','owner','admin') then raise exception 'Tidak memiliki akses'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 200 or p_active is null or p_units is null or cardinality(p_units) = 0 or array_position(p_units, null) is not null
     or exists (select 1 from unnest(p_units) u where not exists(select 1 from public.unit_catalog c where c.code=u and (c.active or exists(select 1 from public.product_units pu where pu.product_id=p_id and pu.unit=u)))) then raise exception 'Data produk atau satuan tidak valid'; end if;
  if p_id is null then insert into public.products(name,active) values(trim(p_name),p_active) returning id into v_id;
  else update public.products set name=trim(p_name),active=p_active,updated_at=now() where id=p_id returning id into v_id; if v_id is null then raise exception 'Produk tidak ditemukan'; end if; end if;
  delete from public.product_units where product_id=v_id and unit <> all(p_units);
  insert into public.product_units(product_id,unit) select v_id,u from unnest(p_units) u on conflict do nothing;
  return v_id;
end $$;
notify pgrst, 'reload schema';
commit;
