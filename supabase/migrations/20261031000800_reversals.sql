begin;
alter table public.operations drop constraint operations_kind_check;
alter table public.operations add constraint operations_kind_check check(kind in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer','deposit','payroll','advance','advance_repayment','reversal'));
alter table public.operations add column reversed_by uuid unique references public.operations(id);
alter table public.payments add column reversed_by uuid unique references public.operations(id);
alter table public.cash_movements drop constraint cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check(source_type in ('opening','opening_correction','payment','sale','sale_return','purchase_return','finance','transfer','deposit','payroll','advance','advance_repayment','reversal'));
alter table public.stock_movements drop constraint stock_movements_source_type_check;
alter table public.stock_movements add constraint stock_movements_source_type_check check(source_type in ('opening','opening_correction','purchase_receipt','production','sale','sale_return','purchase_return','adjustment','reversal'));
drop trigger audit_payments on public.payments;
create trigger audit_payments after insert or update on public.payments for each row execute function public.audit_master_change();
create policy office_team_directory on public.profiles for select to authenticated using(active and public.office_access());
create policy office_team_roles on public.profile_extra_roles for select to authenticated using(public.office_access());

create function public.reverse_document(p_id uuid,p_kind text,p_source uuid,p_date date,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; existing public.operations%rowtype; pay public.payments%rowtype; m record; data jsonb; employee_balance numeric; loan_balance numeric;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_id is null or p_source is null or p_date is null or p_kind is null or p_kind not in ('operation','payment') or length(trim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Data koreksi tidak valid'; end if;
 select * into existing from public.operations where id=p_id;
 if found then
  if existing.kind='reversal' and existing.source_id=p_source and existing.operation_date=p_date and existing.created_by=auth.uid() and existing.note=trim(p_note) then return p_id; end if;
  raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if p_kind='payment' then
   select * into pay from public.payments where id=p_source for update;
   if not found or pay.reversed_by is not null then raise exception 'Pembayaran tidak tersedia atau sudah dikoreksi'; end if;
   if exists(select 1 from public.operations where source_id=pay.source_id and kind in ('sale_return','purchase_return') and status='final' and reversed_by is null and refund_amount>0) then raise exception 'Koreksi retur dana terlebih dahulu sebelum membatalkan pembayaran'; end if;
   data:=jsonb_build_object('original_kind','payment','payment_source',pay.source_id,'date',p_date);
 else
   select * into d from public.operations where id=p_source for update;
   if not found or d.reversed_by is not null or d.status not in ('final','verified') then raise exception 'Dokumen tidak tersedia atau sudah dikoreksi'; end if;
   if d.kind in ('sale','reversal') then raise exception 'Gunakan retur untuk penjualan final'; end if;
   if d.kind='deposit' and d.created_by=auth.uid() then raise exception 'Tidak dapat mengoreksi setoran sendiri'; end if;
   if d.kind='advance' then
     select advance_balance::numeric into employee_balance from public.employee_balances where id=(d.payload->>'employee')::uuid;
     if employee_balance<d.amount then raise exception 'Kasbon sudah dilunasi sebagian; koreksi pembayaran atau potongan gaji dahulu'; end if;
   end if;
   if d.kind='finance' and d.category='loan_received' then
     select coalesce(sum(case when o.category='loan_received' then o.amount else -o.amount end),0) into loan_balance from public.operations o where o.kind='finance' and o.status='final' and o.reversed_by is null and o.category in ('loan_received','loan_principal') and o.payload->>'loan_reference'=d.payload->>'loan_reference';
     if loan_balance<d.amount then raise exception 'Pinjaman sudah diangsur; koreksi angsuran dahulu'; end if;
   end if;
   if d.kind='finance' and d.category='fixed_asset' and exists(select 1 from public.fixed_assets where id=d.id and disposed_by is not null) then raise exception 'Aset sudah dijual; koreksi penjualan aset dahulu'; end if;
   data:=d.payload||jsonb_build_object('original_kind',d.kind,'date',p_date);
 end if;
 insert into public.operations(id,kind,operation_date,status,source_id,category,amount,note,payload,created_by,finalized_by)
 values(p_id,'reversal',p_date,'final',p_source,case when p_kind='operation' then d.category else null end,case when p_kind='payment' then pay.amount else d.amount end,trim(p_note),data,auth.uid(),auth.uid());
 for m in select * from public.stock_movements where source_id=p_source and p_kind='operation' order by quantity desc loop
   perform public.move_stock(p_id,'reversal',p_date,m.product_id,m.variant_id,m.unit,-m.quantity,p_note);
 end loop;
 for m in select * from public.cash_movements where source_id=p_source and ((p_kind='payment' and source_type='payment') or (p_kind='operation' and source_type<>'payment')) order by amount desc loop
   perform public.move_cash(p_id,'reversal',p_date,m.account_id,-m.amount,p_note);
 end loop;
 if p_kind='payment' then update public.payments set reversed_by=p_id where id=p_source;
 else
   update public.operations set reversed_by=p_id where id=p_source;
   if d.kind='finance' and d.category='fixed_asset' then update public.fixed_assets set disposed_by=p_id,book_value_at_disposal=cost where id=d.id;
   elsif d.kind='finance' and d.category='asset_sale' then update public.fixed_assets set disposed_by=null,book_value_at_disposal=null where disposed_by=d.id; end if;
 end if;
 return p_id;
end $$;
revoke all on function public.reverse_document(uuid,text,uuid,date,text) from public,anon;
grant execute on function public.reverse_document(uuid,text,uuid,date,text) to authenticated;

create or replace view public.operation_details with(security_invoker=true) as
select id,document_no,kind,operation_date,status,partner_id,source_id,assigned_to,due_date,account_id,target_account_id,category,amount::text,discount::text,refund_amount::text,note,payload,created_by,created_at,updated_at,finalized_by,verified_by,verified_at,reversed_by from public.operations;
create or replace view public.employee_balances with(security_invoker=true) as
select e.id,e.name,e.employment_type,e.active,e.rate::text,
 coalesce(sum((case when o.kind='reversal' then -1 else 1 end)*(case when (case when o.kind='reversal' then o.payload->>'original_kind' else o.kind end)='advance' then o.amount when (case when o.kind='reversal' then o.payload->>'original_kind' else o.kind end)='advance_repayment' then -o.amount when (case when o.kind='reversal' then o.payload->>'original_kind' else o.kind end)='payroll' then -coalesce(nullif(o.payload->>'advance_deduction','')::numeric,0) else 0 end)),0)::text advance_balance
from public.employees e left join public.operations o on o.payload->>'employee'=e.id::text and o.status='final' group by e.id;
notify pgrst,'reload schema';
commit;
