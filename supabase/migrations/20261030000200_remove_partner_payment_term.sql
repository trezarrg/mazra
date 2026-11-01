begin;
lock table public.partners in access exclusive mode;
do $$
begin
  if exists (select 1 from public.partners where payment_term_days is not null) then
    raise exception 'Termin mitra berisi data; penghapusan dibatalkan';
  end if;
end $$;
alter table public.partners drop column payment_term_days;
notify pgrst, 'reload schema';
commit;
