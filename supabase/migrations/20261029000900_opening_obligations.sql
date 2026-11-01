begin;
create table public.opening_obligations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id),
  kind text not null check (kind in ('receivable','payable')),
  reference text not null check (length(trim(reference)) between 1 and 200),
  amount numeric(20,2) not null check (amount > 0),
  cutoff_date date not null,
  due_date date,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index opening_obligations_once on public.opening_obligations(partner_id, kind, lower(trim(reference)));
create trigger audit_opening_obligations after insert on public.opening_obligations for each row execute function public.audit_master_change();
alter table public.opening_obligations enable row level security;
revoke all on public.opening_obligations from anon, authenticated;
grant select on public.opening_obligations to authenticated;
create policy opening_obligations_read on public.opening_obligations for select to authenticated using (public.current_app_role() in ('developer','owner','admin'));
create view public.opening_obligation_list with (security_invoker = true) as
select o.id, o.kind, o.reference, o.amount::text as amount, o.cutoff_date, o.due_date, o.note, p.name as partner_name
from public.opening_obligations o join public.partners p on p.id = o.partner_id;
revoke all on public.opening_obligation_list from anon;
grant select on public.opening_obligation_list to authenticated;

create function public.post_opening_obligation(p_partner uuid, p_kind text, p_reference text, p_amount numeric, p_date date, p_due date, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_amount numeric; v_due date; v_cutoff date;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('developer','owner') then raise exception 'Tidak memiliki akses'; end if;
  if p_partner is null or p_kind is null or p_kind not in ('receivable','payable') or length(trim(coalesce(p_reference,''))) not between 1 and 200
     or p_amount is null or p_amount <= 0 or p_amount > 999999999999999.99 or p_amount <> round(p_amount,2) or p_date is null
     or length(coalesce(p_note,'')) > 1000 then raise exception 'Data saldo awal tidak valid'; end if;
  if not exists(select 1 from public.partners where id = p_partner and active and ((p_kind = 'receivable' and is_customer) or (p_kind = 'payable' and is_supplier))) then raise exception 'Mitra tidak sesuai jenis tagihan'; end if;
  perform pg_advisory_xact_lock(hashtext('ayam_potong_opening'));
  select cutoff_date into v_cutoff from public.opening_cutoff where id;
  if v_cutoff is null then insert into public.opening_cutoff(cutoff_date,created_by) values (p_date, auth.uid());
  elsif v_cutoff <> p_date then raise exception 'Tanggal saldo awal harus sama dengan tanggal awal yang telah ditetapkan'; end if;
  select id, amount, due_date into v_id, v_amount, v_due from public.opening_obligations
    where partner_id = p_partner and kind = p_kind and lower(trim(reference)) = lower(trim(p_reference));
  if v_id is null then
    insert into public.opening_obligations(partner_id,kind,reference,amount,cutoff_date,due_date,note,created_by)
    values(p_partner,p_kind,trim(p_reference),p_amount,p_date,p_due,nullif(trim(p_note),''),auth.uid()) returning id into v_id;
  elsif v_amount <> p_amount or v_due is distinct from p_due then raise exception 'Saldo awal tagihan sudah dicatat'; end if;
  return v_id;
end $$;
revoke all on function public.post_opening_obligation(uuid,text,text,numeric,date,date,text) from public, anon;
grant execute on function public.post_opening_obligation(uuid,text,text,numeric,date,date,text) to authenticated;
notify pgrst, 'reload schema';
commit;
