begin;
-- Staff names are needed when assigning a collector cash account.
create policy profiles_admin_collectors on public.profiles for select to authenticated
  using (public.current_app_role() = 'admin' and role = 'collector' and active);

-- Only a developer can create or change developer access.
create function public.guard_developer_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.current_app_role() is distinct from 'developer'
     and (new.role = 'developer' or (tg_op = 'UPDATE' and old.role = 'developer')) then
    raise exception 'Hanya developer dapat mengubah akses developer';
  end if;
  return new;
end $$;
revoke all on function public.guard_developer_role() from public, anon, authenticated;
create trigger guard_developer_role before insert or update on public.profiles
  for each row execute function public.guard_developer_role();
-- Product and its allowed units must change atomically, including repeated requests.
create function public.save_product(p_id uuid, p_name text, p_units text[], p_active boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if public.current_app_role() not in ('developer', 'owner', 'admin') or public.current_app_role() is null then
    raise exception 'Tidak memiliki akses';
  end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 200 or p_active is null
     or p_units is null or cardinality(p_units) = 0 or array_position(p_units, null) is not null
     or exists (select 1 from unnest(p_units) u where u not in ('kg','ekor','pcs')) then
    raise exception 'Data produk tidak valid';
  end if;
  if p_id is null then
    insert into public.products(name, active) values (trim(p_name), p_active) returning id into v_id;
  else
    update public.products set name = trim(p_name), active = p_active, updated_at = now() where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Produk tidak ditemukan'; end if;
  end if;
  delete from public.product_units where product_id = v_id and unit <> all(p_units);
  insert into public.product_units(product_id, unit) select v_id, u from unnest(p_units) u on conflict do nothing;
  return v_id;
end $$;
revoke all on function public.save_product(uuid, text, text[], boolean) from public, anon;
grant execute on function public.save_product(uuid, text, text[], boolean) to authenticated;
-- Units may be removed only by this controlled function, not directly by a client.
-- The function runs as invoker, so permit deletion subject to the existing RLS policies.
grant delete on public.product_units to authenticated;
notify pgrst, 'reload schema';
commit;
