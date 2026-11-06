-- Semua akun dan perubahan pengujian dibatalkan pada akhir skrip.
begin;
create function pg_temp.assert_developer(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Uji developer gagal: %',label; end if; end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('dd000000-0000-4000-8000-000000000001','dev-access-test@example.invalid',now()),
 ('dd000000-0000-4000-8000-000000000002','owner-access-test@example.invalid',now());
insert into public.profiles(id,full_name,role) values
 ('dd000000-0000-4000-8000-000000000001','Developer uji','developer'),
 ('dd000000-0000-4000-8000-000000000002','Owner uji','owner');
set local role authenticated;
select set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_developer((select count(*) from public.profiles where role='developer')=0,'Owner tidak menerima ID atau nama developer melalui SELECT');
select pg_temp.assert_developer(public.has_app_role(array['owner']),'Owner tetap dapat dikenali');
select pg_temp.assert_developer((select count(*) from public.profiles where id=auth.uid())=1,'Owner tetap membaca profil sendiri');
do $$ begin
  begin
    perform public.save_team_access('dd000000-0000-4000-8000-000000000001','Diubah owner',array['owner'],false);
  exception when others then
    if sqlerrm='Pengguna tidak dapat diubah' then return; end if;
    raise;
  end;
  raise exception 'Owner seharusnya tidak bisa mengubah developer';
end $$;
select set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_developer(public.current_app_role()='developer','Developer tetap terautentikasi');
select pg_temp.assert_developer((select count(*) from public.profiles where id=auth.uid())=1,'Developer bisa membaca profil sendiri');
select pg_temp.assert_developer((select count(*) from public.profiles where id='dd000000-0000-4000-8000-000000000002')=1,'Developer tetap mengelola tim');
select pg_temp.assert_developer(public.office_access(),'Developer tetap memiliki akses pengelola');
select public.save_team_access('dd000000-0000-4000-8000-000000000002','Owner diubah developer',array['owner'],true);
select pg_temp.assert_developer((select full_name from public.profiles where id='dd000000-0000-4000-8000-000000000002')='Owner diubah developer','Developer dapat mengubah owner');
reset role;
rollback;
