begin;
alter table public.business_settings add column logo_path text
  check(logo_path is null or logo_path ~ '^logos/[0-9a-f-]{36}\.(png|jpg|webp)$');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-branding','business-branding',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy business_logo_read on storage.objects for select to anon,authenticated
  using(bucket_id='business-branding');
create policy business_logo_insert on storage.objects for insert to authenticated
  with check(bucket_id='business-branding' and public.has_app_role(array['developer','owner'])
    and name ~ '^logos/[0-9a-f-]{36}\.(png|jpg|webp)$');
create policy business_logo_cleanup on storage.objects for delete to authenticated
  using(bucket_id='business-branding' and public.has_app_role(array['developer','owner'])
    and not exists(select 1 from public.business_settings b where b.logo_path=storage.objects.name));

-- Hanya identitas yang memang tampil di halaman masuk; bukan telepon/alamat/data usaha lainnya.
create function public.public_business_branding() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('name',name,'logo_path',logo_path) from public.business_settings where id=true
$$;
revoke all on function public.public_business_branding() from public;
grant execute on function public.public_business_branding() to anon,authenticated;

create function public.save_business_settings(p_name text,p_phone text,p_address text,p_logo_path text,p_replace_logo boolean)
returns text language plpgsql security invoker set search_path='' as $$
declare previous_logo text;
begin
  if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 200 or length(coalesce(p_phone,''))>50
     or length(coalesce(p_address,''))>1000 or p_replace_logo is null then raise exception 'Identitas usaha tidak valid'; end if;
  select logo_path into previous_logo from public.business_settings where id=true for update;
  if not found then raise exception 'Pengaturan usaha belum tersedia'; end if;
  if p_replace_logo and p_logo_path is not null and
    (p_logo_path !~ '^logos/[0-9a-f-]{36}\.(png|jpg|webp)$' or not exists(
      select 1 from storage.objects where bucket_id='business-branding' and name=p_logo_path)) then
    raise exception 'Logo belum diunggah atau tidak valid';
  end if;
  update public.business_settings set name=trim(p_name),phone=nullif(trim(p_phone),''),address=nullif(trim(p_address),''),
    logo_path=case when p_replace_logo then p_logo_path else logo_path end,updated_at=now() where id=true;
  return previous_logo;
end $$;
revoke all on function public.save_business_settings(text,text,text,text,boolean) from public,anon;
grant execute on function public.save_business_settings(text,text,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
