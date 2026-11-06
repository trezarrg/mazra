begin;
-- Restrictive policy membatasi seluruh policy SELECT lama, termasuk office_team_directory.
-- Developer tetap dapat membaca profilnya sendiri dan seluruh data tim.
create policy profiles_developer_visibility on public.profiles
  as restrictive for select to authenticated
  using (role <> 'developer' or id = auth.uid() or public.current_app_role() = 'developer');
notify pgrst, 'reload schema';
commit;
