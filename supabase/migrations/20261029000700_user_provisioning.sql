begin;
create function public.provision_profile(p_email text, p_name text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_role text;
begin
  v_role := public.current_app_role();
  if v_role is null or v_role not in ('developer','owner') then raise exception 'Tidak memiliki akses'; end if;
  if p_role not in ('developer','owner','admin','production','driver','collector') or p_role is null
     or (p_role = 'developer' and v_role <> 'developer') or length(trim(coalesce(p_name,''))) = 0 or length(p_name) > 200 then raise exception 'Data pengguna tidak valid'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null and is_anonymous is not true;
  if v_user is null then raise exception 'Akun Auth yang terkonfirmasi tidak ditemukan'; end if;
  if exists(select 1 from public.profiles where id = v_user) then raise exception 'Profil pengguna sudah ada'; end if;
  insert into public.profiles(id,full_name,role) values (v_user, trim(p_name), p_role);
  return v_user;
end $$;
revoke all on function public.provision_profile(text,text,text) from public, anon;
grant execute on function public.provision_profile(text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
