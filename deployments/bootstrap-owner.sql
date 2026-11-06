-- Jalankan hanya SEKALI melalui SQL Editor proyek klien setelah seluruh migrasi selesai.
-- Buat akun email melalui Authentication > Users terlebih dahulu.
-- Ganti dua nilai berikut; jangan menyimpan kata sandi di SQL ini.
begin;
do $$
declare
  owner_email text := 'GANTI_EMAIL_PEMILIK';
  owner_name text := 'GANTI_NAMA_PRIBADI_PEMILIK';
  business_name text := 'GANTI_NAMA_USAHA';
  owner_id uuid;
begin
  if owner_email = 'GANTI_EMAIL_PEMILIK' or owner_name = 'GANTI_NAMA_PRIBADI_PEMILIK' or business_name = 'GANTI_NAMA_USAHA' then
    raise exception 'Isi email, nama pribadi pemilik, dan nama usaha terlebih dahulu';
  end if;
  if exists(select 1 from public.profiles where role <> 'developer') or exists(select 1 from public.operations)
     or exists(select 1 from public.purchase_receipts) or exists(select 1 from public.payments)
     or exists(select 1 from public.stock_movements) or exists(select 1 from public.cash_movements) then
    raise exception 'Proyek sudah memiliki profil atau transaksi; bootstrap dihentikan';
  end if;
  if (select count(*) from auth.users where lower(email)=lower(trim(owner_email))) <> 1 then
    raise exception 'Buat satu akun pemilik yang sesuai melalui Supabase Authentication terlebih dahulu';
  end if;
  select id into owner_id from auth.users where lower(email)=lower(trim(owner_email));
  insert into public.profiles(id,full_name,role,active) values(owner_id,trim(owner_name),'owner',true);
  update public.business_settings set name=trim(business_name),updated_at=now() where id=true;
end $$;
commit;
