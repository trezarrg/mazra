begin;
alter table public.stock_movements drop constraint stock_movements_source_type_check;
alter table public.stock_movements add constraint stock_movements_source_type_check check (source_type in ('opening','opening_correction'));
alter table public.cash_movements drop constraint cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (source_type in ('opening','opening_correction'));
create table public.opening_corrections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cash','stock','obligation')),
  original_id uuid not null,
  movement_id uuid,
  previous_amount numeric(20,3) not null,
  new_amount numeric(20,3) not null,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index opening_corrections_original on public.opening_corrections(kind, original_id);
create trigger audit_opening_corrections after insert on public.opening_corrections for each row execute function public.audit_master_change();
alter table public.opening_corrections enable row level security;
revoke all on public.opening_corrections from anon, authenticated;
grant select on public.opening_corrections to authenticated;
create policy corrections_read on public.opening_corrections for select to authenticated using (public.current_app_role() in ('developer','owner','admin'));
create view public.opening_correction_options with (security_invoker = true) as
select 'cash'::text as kind, m.id, a.name as label, (m.amount + coalesce((select sum(c.new_amount-c.previous_amount) from public.opening_corrections c where c.kind='cash' and c.original_id=m.id),0))::text as amount, null::text as unit
from public.cash_movements m join public.cash_accounts a on a.id=m.account_id where m.source_type='opening'
union all
select 'stock', m.id, p.name || coalesce(' - ' || v.name,''), (m.quantity + coalesce((select sum(c.new_amount-c.previous_amount) from public.opening_corrections c where c.kind='stock' and c.original_id=m.id),0))::text, m.unit
from public.stock_movements m join public.products p on p.id=m.product_id left join public.product_variants v on v.id=m.variant_id where m.source_type='opening'
union all
select 'obligation', o.id, p.name || ' - ' || o.reference, (o.amount + coalesce((select sum(c.new_amount-c.previous_amount) from public.opening_corrections c where c.kind='obligation' and c.original_id=o.id),0))::text, null::text
from public.opening_obligations o join public.partners p on p.id=o.partner_id;
grant select on public.opening_correction_options to authenticated;
create or replace view public.opening_obligation_list with (security_invoker = true) as
select o.id, o.kind, o.reference, (o.amount + coalesce((select sum(c.new_amount-c.previous_amount) from public.opening_corrections c where c.kind='obligation' and c.original_id=o.id),0))::text as amount, o.cutoff_date, o.due_date, o.note, p.name as partner_name
from public.opening_obligations o join public.partners p on p.id = o.partner_id;
create or replace view public.stock_history with (security_invoker = true) as
select m.id, m.quantity::text as quantity, m.unit, m.movement_date, m.created_at, p.name as product_name, v.name as variant_name, m.source_type
from public.stock_movements m join public.products p on p.id = m.product_id left join public.product_variants v on v.id = m.variant_id;
create or replace view public.cash_history with (security_invoker = true) as
select m.id, m.amount::text as amount, m.movement_date, m.created_at, a.name as account_name, m.source_type
from public.cash_movements m join public.cash_accounts a on a.id = m.account_id;
create function public.correct_opening(p_kind text, p_id uuid, p_expected numeric, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_original numeric; v_current numeric; v_delta numeric; v_unit text; v_movement uuid; v_id uuid; v_date date; v_account uuid; v_product uuid; v_variant uuid;
begin
 if public.current_app_role() is null or public.current_app_role() not in ('developer','owner') then raise exception 'Tidak memiliki akses'; end if;
 if p_kind is null or p_kind not in ('cash','stock','obligation') or p_id is null or p_expected is null or p_amount is null or p_amount < 0 or p_amount > 999999999999999 or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Data koreksi tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtext('ayam_potong_opening'));
 if p_kind='cash' then
   select amount,movement_date,account_id into v_original,v_date,v_account from public.cash_movements where id=p_id and source_type='opening';
 elsif p_kind='stock' then
   select quantity,movement_date,product_id,variant_id,unit into v_original,v_date,v_product,v_variant,v_unit from public.stock_movements where id=p_id and source_type='opening';
 else
   select amount,cutoff_date into v_original,v_date from public.opening_obligations where id=p_id;
 end if;
 if v_original is null then raise exception 'Saldo awal tidak ditemukan'; end if;
 if (p_kind in ('cash','obligation') and p_amount <> round(p_amount,2)) or (p_kind='stock' and (p_amount <> round(p_amount,3) or (v_unit in ('ekor','pcs') and p_amount <> trunc(p_amount)))) then raise exception 'Jumlah koreksi tidak valid'; end if;
 select v_original + coalesce(sum(new_amount-previous_amount),0) into v_current from public.opening_corrections where kind=p_kind and original_id=p_id;
 if v_current <> p_expected then raise exception 'Saldo awal sudah berubah, muat ulang halaman'; end if;
 v_delta := p_amount-v_current;
 if v_delta=0 then raise exception 'Jumlah baru sama dengan jumlah sebelumnya'; end if;
 if p_kind='cash' then
   insert into public.cash_movements(account_id,amount,movement_date,source_type,note,created_by) values(v_account,v_delta,v_date,'opening_correction',trim(p_reason),auth.uid()) returning id into v_movement;
 elsif p_kind='stock' then
   insert into public.stock_movements(product_id,variant_id,unit,quantity,movement_date,source_type,note,created_by) values(v_product,v_variant,v_unit,v_delta,v_date,'opening_correction',trim(p_reason),auth.uid()) returning id into v_movement;
 end if;
 insert into public.opening_corrections(kind,original_id,movement_id,previous_amount,new_amount,reason,created_by) values(p_kind,p_id,v_movement,v_current,p_amount,trim(p_reason),auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.correct_opening(text,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.correct_opening(text,uuid,numeric,numeric,text) to authenticated;
notify pgrst, 'reload schema';
commit;
