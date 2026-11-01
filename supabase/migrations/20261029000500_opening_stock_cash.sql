begin;
create table public.opening_cutoff (
  id boolean primary key default true check (id),
  cutoff_date date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  unit text not null check (unit in ('kg','ekor','pcs')),
  quantity numeric(18,3) not null check (quantity <> 0),
  movement_date date not null,
  source_type text not null check (source_type = 'opening'),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index stock_opening_once on public.stock_movements(product_id, variant_id, unit) nulls not distinct where source_type = 'opening';
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id),
  amount numeric(20,2) not null check (amount <> 0),
  movement_date date not null,
  source_type text not null check (source_type = 'opening'),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index cash_opening_once on public.cash_movements(account_id) where source_type = 'opening';
create trigger audit_opening_cutoff after insert on public.opening_cutoff for each row execute function public.audit_master_change();
create trigger audit_stock_movements after insert on public.stock_movements for each row execute function public.audit_master_change();
create trigger audit_cash_movements after insert on public.cash_movements for each row execute function public.audit_master_change();

alter table public.opening_cutoff enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_movements enable row level security;
revoke all on public.opening_cutoff, public.stock_movements, public.cash_movements from anon, authenticated;
grant select on public.opening_cutoff, public.stock_movements, public.cash_movements to authenticated;
create policy cutoff_read on public.opening_cutoff for select to authenticated using (public.current_app_role() in ('developer','owner','admin'));
create policy stock_read on public.stock_movements for select to authenticated using (public.current_app_role() in ('developer','owner','admin','production'));
create policy cash_read on public.cash_movements for select to authenticated using (public.current_app_role() in ('developer','owner','admin'));

create function public.post_opening(p_kind text, p_date date, p_record uuid, p_variant uuid, p_unit text, p_amount numeric, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_existing uuid; v_existing_amount numeric; v_cutoff date;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('developer','owner') then raise exception 'Tidak memiliki akses'; end if;
  if p_date is null or p_record is null or p_amount is null or p_amount <= 0 or p_amount > 999999999999999.999 or length(coalesce(p_note,'')) > 1000 then raise exception 'Data saldo awal tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtext('ayam_potong_opening'));
  select cutoff_date into v_cutoff from public.opening_cutoff where id;
  if v_cutoff is null then
    insert into public.opening_cutoff(cutoff_date, created_by) values (p_date, auth.uid());
  elsif v_cutoff <> p_date then raise exception 'Tanggal saldo awal harus sama dengan tanggal awal yang telah ditetapkan'; end if;
  if p_kind = 'stock' then
    if p_unit is null or p_unit not in ('kg','ekor','pcs') or p_amount <> round(p_amount,3) or (p_unit in ('ekor','pcs') and p_amount <> trunc(p_amount))
      or not exists(select 1 from public.products p join public.product_units u on u.product_id = p.id where p.id = p_record and p.active and u.unit = p_unit)
      or (p_variant is not null and not exists(select 1 from public.product_variants where id = p_variant and product_id = p_record and active)) then
      raise exception 'Produk, varian, satuan atau jumlah tidak valid';
    end if;
    select id, quantity into v_existing, v_existing_amount from public.stock_movements where source_type = 'opening' and product_id = p_record and variant_id is not distinct from p_variant and unit = p_unit;
    if v_existing is null then
      insert into public.stock_movements(product_id, variant_id, unit, quantity, movement_date, source_type, note, created_by)
        values (p_record, p_variant, p_unit, p_amount, p_date, 'opening', nullif(trim(p_note),''), auth.uid()) returning id into v_existing;
    elsif v_existing_amount <> p_amount then raise exception 'Saldo awal stok sudah dicatat'; end if;
  elsif p_kind = 'cash' then
    if p_variant is not null or p_unit is not null or p_amount <> round(p_amount,2) or not exists(select 1 from public.cash_accounts where id = p_record and active) then raise exception 'Akun atau nominal tidak valid'; end if;
    select id, amount into v_existing, v_existing_amount from public.cash_movements where source_type = 'opening' and account_id = p_record;
    if v_existing is null then
      insert into public.cash_movements(account_id, amount, movement_date, source_type, note, created_by)
        values (p_record, p_amount, p_date, 'opening', nullif(trim(p_note),''), auth.uid()) returning id into v_existing;
    elsif v_existing_amount <> p_amount then raise exception 'Saldo awal akun sudah dicatat'; end if;
  else raise exception 'Jenis saldo awal tidak valid'; end if;
  return v_existing;
end $$;
revoke all on function public.post_opening(text,date,uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.post_opening(text,date,uuid,uuid,text,numeric,text) to authenticated;
notify pgrst, 'reload schema';
commit;
