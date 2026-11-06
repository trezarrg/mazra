-- Jalankan sebagai administrator proyek melalui SQL Editor setelah membuat akun Auth.
-- Tidak membuat password, tidak mengirim email, dan tidak mengambil alih akun owner.
begin;
do $$
declare
  developer_email text := 'trezarrg@gmail.com';
  developer_id uuid;
begin
  if auth.uid() is not null then raise exception 'Jalankan melalui administrator database, bukan sesi aplikasi'; end if;
  select id into developer_id from auth.users
    where lower(email)=lower(trim(developer_email)) and email_confirmed_at is not null and is_anonymous is not true;
  if developer_id is null then raise exception 'Akun developer Auth terkonfirmasi belum tersedia'; end if;
  if exists(select 1 from public.profiles where id=developer_id and role<>'developer') then
    raise exception 'Email sudah menjadi pengguna operasional; gunakan akun developer yang terpisah';
  end if;
  insert into public.profiles(id,full_name,role,active) values(developer_id,'Developer','developer',true)
    on conflict(id) do update set active=true,updated_at=now() where profiles.role='developer';
end $$;
commit;
