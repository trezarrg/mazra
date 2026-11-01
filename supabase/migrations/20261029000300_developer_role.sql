begin;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('developer', 'owner', 'admin', 'production', 'driver', 'collector'));

-- Developer has access to all currently implemented application operations.
-- Existing grants and transaction integrity rules remain in force.
create policy profiles_developer on public.profiles for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy partners_developer on public.partners for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy products_developer on public.products for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy variants_developer on public.product_variants for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy units_developer on public.product_units for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy accounts_developer on public.cash_accounts for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy settings_developer on public.business_settings for all to authenticated
  using (public.current_app_role() = 'developer') with check (public.current_app_role() = 'developer');
create policy audit_developer on public.audit_events for select to authenticated
  using (public.current_app_role() = 'developer');

do $$
begin
  if (select count(*) from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = 'trezarrg@gmail.com' and p.active) <> 1 then
    raise exception 'Profil developer aktif tidak ditemukan atau tidak unik';
  end if;
  update public.profiles set role = 'developer', updated_at = now()
    where id = (select id from auth.users where lower(email) = 'trezarrg@gmail.com');
end $$;

notify pgrst, 'reload schema';
commit;
