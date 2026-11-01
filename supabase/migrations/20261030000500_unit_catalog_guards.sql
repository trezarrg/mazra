begin;
revoke delete on public.unit_catalog from authenticated;
create or replace function public.guard_unit_catalog() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.id is distinct from old.id or new.code is distinct from old.code or new.whole_only is distinct from old.whole_only then
   raise exception 'Kode dan jenis satuan tidak dapat diubah';
 end if;
 return new;
end $$;
notify pgrst, 'reload schema';
commit;
