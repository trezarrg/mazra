begin;
create table public.profile_extra_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  role text not null check (role in ('owner','admin','production','driver','collector')),
  unique(profile_id,role)
);
create trigger audit_profile_extra_roles after insert or delete on public.profile_extra_roles for each row execute function public.audit_master_change();
alter table public.profile_extra_roles enable row level security;
revoke all on public.profile_extra_roles from public, anon, authenticated;
grant select on public.profile_extra_roles to authenticated;
create function public.has_app_role(p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and (p.role=any(p_roles) or exists(select 1 from public.profile_extra_roles r where r.profile_id=p.id and r.role=any(p_roles))))
$$;
revoke all on function public.has_app_role(text[]) from public, anon;
grant execute on function public.has_app_role(text[]) to authenticated;
create policy extra_roles_read on public.profile_extra_roles for select to authenticated using (profile_id=auth.uid() or public.has_app_role(array['developer','owner']) or (public.has_app_role(array['admin']) and role='collector'));
create policy profiles_extra_read on public.profiles for select to authenticated using (public.has_app_role(array['developer','owner']) or (active and public.has_app_role(array['admin']) and exists(select 1 from public.profile_extra_roles e where e.profile_id=profiles.id and e.role='collector')));
create policy partners_extra on public.partners for all to authenticated using (public.has_app_role(array['developer','owner','admin'])) with check (public.has_app_role(array['developer','owner','admin']));
create policy products_extra_read on public.products for select to authenticated using (public.has_app_role(array['developer','owner','admin','production']));
create policy products_extra_write on public.products for all to authenticated using (public.has_app_role(array['developer','owner','admin'])) with check (public.has_app_role(array['developer','owner','admin']));
create policy variants_extra_read on public.product_variants for select to authenticated using (public.has_app_role(array['developer','owner','admin','production']));
create policy variants_extra_write on public.product_variants for all to authenticated using (public.has_app_role(array['developer','owner','admin'])) with check (public.has_app_role(array['developer','owner','admin']));
create policy product_units_extra_read on public.product_units for select to authenticated using (public.has_app_role(array['developer','owner','admin','production']));
create policy product_units_extra_write on public.product_units for all to authenticated using (public.has_app_role(array['developer','owner','admin'])) with check (public.has_app_role(array['developer','owner','admin']));
create policy catalog_extra_write on public.unit_catalog for all to authenticated using (public.has_app_role(array['developer','owner','admin'])) with check (public.has_app_role(array['developer','owner','admin']));
create policy cash_accounts_extra_read on public.cash_accounts for select to authenticated using (public.has_app_role(array['developer','owner','admin']) or (public.has_app_role(array['collector']) and holder_id=auth.uid()));
create policy cash_accounts_extra_write on public.cash_accounts for all to authenticated using (public.has_app_role(array['developer','owner','admin'])) with check (public.has_app_role(array['developer','owner','admin']));
create policy business_settings_extra_write on public.business_settings for all to authenticated using (public.has_app_role(array['developer','owner'])) with check (public.has_app_role(array['developer','owner']));
create policy audit_extra_read on public.audit_events for select to authenticated using (public.has_app_role(array['developer','owner']));
create policy stock_extra_read on public.stock_movements for select to authenticated using (public.has_app_role(array['developer','owner','admin','production']));
create policy cash_extra_read on public.cash_movements for select to authenticated using (public.has_app_role(array['developer','owner','admin']));
create function public.save_team_access(p_id uuid, p_name text, p_roles text[], p_active boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare old_role text; primary_role text;
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or length(trim(coalesce(p_name,''))) not between 1 and 200 or p_active is null or p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null or exists(select 1 from unnest(p_roles) r where r not in ('owner','admin','production','driver','collector')) then raise exception 'Data pengguna tidak valid'; end if;
 select role into old_role from public.profiles where id=p_id for update;
 if old_role is null or old_role='developer' then raise exception 'Pengguna tidak dapat diubah'; end if;
 if p_id=auth.uid() and (not p_active or not ('owner'=any(p_roles))) then raise exception 'Akses pengelola sendiri tidak dapat dihapus'; end if;
 select r into primary_role from unnest(p_roles) r order by array_position(array['owner','admin','production','driver','collector'],r) limit 1;
 update public.profiles set full_name=trim(p_name),role=primary_role,active=p_active,updated_at=now() where id=p_id;
 delete from public.profile_extra_roles where profile_id=p_id and not (role=any(p_roles) and role<>primary_role);
 insert into public.profile_extra_roles(profile_id,role) select p_id,r from (select distinct unnest(p_roles) r) roles where r<>primary_role on conflict do nothing;
 return p_id;
end $$;
revoke all on function public.save_team_access(uuid,text,text[],boolean) from public, anon;
grant execute on function public.save_team_access(uuid,text,text[],boolean) to authenticated;
create function public.add_team_access(p_email text, p_name text, p_roles text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; primary_role text;
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null or exists(select 1 from unnest(p_roles) r where r not in ('owner','admin','production','driver','collector')) then raise exception 'Data pengguna tidak valid'; end if;
 select id into v_id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null and is_anonymous is not true;
 if v_id is null then raise exception 'Akun Auth terkonfirmasi tidak ditemukan'; end if;
 if exists(select 1 from public.profiles where id=v_id) then raise exception 'Profil pengguna sudah ada'; end if;
 select r into primary_role from unnest(p_roles) r order by array_position(array['owner','admin','production','driver','collector'],r) limit 1;
 insert into public.profiles(id,full_name,role) values(v_id,trim(p_name),primary_role);
 insert into public.profile_extra_roles(profile_id,role) select v_id,r from (select distinct unnest(p_roles) r) roles where r<>primary_role;
 return v_id;
end $$;
revoke all on function public.add_team_access(text,text,text[]) from public, anon;
grant execute on function public.add_team_access(text,text,text[]) to authenticated;
create or replace function public.save_product(p_id uuid, p_name text, p_units text[], p_active boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_app_role(array['developer','owner','admin']) then raise exception 'Tidak memiliki akses'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 200 or p_active is null or p_units is null or cardinality(p_units) = 0 or array_position(p_units, null) is not null
     or exists (select 1 from unnest(p_units) u where not exists(select 1 from public.unit_catalog c where c.code=u and (c.active or exists(select 1 from public.product_units pu where pu.product_id=p_id and pu.unit=u)))) then raise exception 'Data produk atau satuan tidak valid'; end if;
  if p_id is null then insert into public.products(name,active) values(trim(p_name),p_active) returning id into v_id;
  else update public.products set name=trim(p_name),active=p_active,updated_at=now() where id=p_id returning id into v_id; if v_id is null then raise exception 'Produk tidak ditemukan'; end if; end if;
  delete from public.product_units where product_id=v_id and unit <> all(p_units);
  insert into public.product_units(product_id,unit) select v_id,u from unnest(p_units) u on conflict do nothing;
  return v_id;
end $$;
notify pgrst,'reload schema';
commit;
