begin;
create table public.employees (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
 job_title text, employment_type text not null check(employment_type in ('permanent','daily','piecework')),
 rate numeric(20,2) not null default 0 check(rate>=0), active boolean not null default true,
 note text, created_at timestamptz not null default now()
);
create table public.fixed_assets (
 id uuid primary key references public.operations(id), name text not null,
 acquisition_date date not null, cost numeric(20,2) not null check(cost>0),
 disposed_by uuid unique references public.operations(id), book_value_at_disposal numeric(20,2),
 check(book_value_at_disposal is null or book_value_at_disposal>=0)
);
alter table public.employees enable row level security;
alter table public.fixed_assets enable row level security;
revoke all on public.employees,public.fixed_assets from public,anon,authenticated;
grant select on public.employees,public.fixed_assets to authenticated;
create policy employees_read on public.employees for select to authenticated using(public.office_access());
create policy assets_read on public.fixed_assets for select to authenticated using(public.office_access());
create trigger audit_employees after insert or update on public.employees for each row execute function public.audit_master_change();
create trigger audit_assets after insert or update on public.fixed_assets for each row execute function public.audit_master_change();
insert into public.finance_categories values('asset_sale','Penjualan aset tetap','in','asset',true);

create function public.save_employee(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 or p_data->>'type' is null or p_data->>'type' not in ('permanent','daily','piecework') or length(coalesce(p_data->>'note',''))>1000 then raise exception 'Data pekerja tidak valid'; end if;
 perform public.assert_amount(coalesce(nullif(p_data->>'rate','')::numeric,0),true);
 insert into public.employees(id,name,job_title,employment_type,rate,active,note) values(p_id,trim(p_data->>'name'),nullif(p_data->>'job',''),p_data->>'type',coalesce(nullif(p_data->>'rate','')::numeric,0),coalesce((p_data->>'active')::boolean,true),nullif(p_data->>'note',''))
 on conflict(id) do update set name=excluded.name,job_title=excluded.job_title,employment_type=excluded.employment_type,rate=excluded.rate,active=excluded.active,note=excluded.note;
 return p_id;
end $$;
revoke all on function public.save_employee(uuid,jsonb) from public,anon;
grant execute on function public.save_employee(uuid,jsonb) to authenticated;

create view public.employee_balances with(security_invoker=true) as
select e.id,e.name,e.employment_type,e.active,e.rate::text,
 coalesce(sum(case when o.kind='advance' then o.amount when o.kind='advance_repayment' then -o.amount when o.kind='payroll' then -coalesce((o.payload->>'advance_deduction')::numeric,0) else 0 end),0)::text advance_balance
from public.employees e left join public.operations o on o.payload->>'employee'=e.id::text and o.status='final' and o.kind in ('advance','advance_repayment','payroll') group by e.id;
grant select on public.employee_balances to authenticated;

create function public.post_hr(p_id uuid,p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; emp uuid; acc uuid; dt date; amount numeric; balance numeric; gross numeric; deduction numeric; advance_deduction numeric; part text; per_start date; per_end date;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_id is null or p_kind is null or p_kind not in ('advance','advance_repayment','payroll') or p_data is null then raise exception 'Jenis transaksi tidak valid'; end if;
 select * into d from public.operations where id=p_id;
 if found then
   if d.kind=p_kind and d.payload=p_data and d.created_by=auth.uid() then return p_id; end if;
   raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 emp:=(p_data->>'employee')::uuid; acc:=(p_data->>'account')::uuid; dt:=(p_data->>'date')::date;
 if dt is null or not exists(select 1 from public.employees where id=emp and active) or length(coalesce(p_data->>'note',''))>1000 then raise exception 'Pekerja atau tanggal tidak valid'; end if;
 if not exists(select 1 from public.cash_accounts where id=acc and account_type in ('cash','bank') and active) then raise exception 'Gunakan kas kantor atau bank'; end if;
 select coalesce(sum(case when kind='advance' then amount when kind='advance_repayment' then -amount when kind='payroll' then -coalesce((payload->>'advance_deduction')::numeric,0) else 0 end),0) into balance from public.operations where status='final' and payload->>'employee'=emp::text;
 if p_kind='payroll' then
   per_start:=nullif(p_data->>'period_start','')::date; per_end:=nullif(p_data->>'period_end','')::date;
   if per_start is null or per_end is null or per_start>per_end then raise exception 'Periode gaji tidak valid'; end if;
   if exists(select 1 from public.operations where kind='payroll' and status='final' and payload->>'employee'=emp::text and (payload->>'period_start')::date<=per_end and (payload->>'period_end')::date>=per_start) then raise exception 'Periode gaji pekerja bertumpang tindih'; end if;
   foreach part in array array['base','overtime','bonus','deduction','advance_deduction'] loop perform public.assert_amount(coalesce(nullif(p_data->>part,'')::numeric,0),true); end loop;
   gross:=coalesce(nullif(p_data->>'base','')::numeric,0)+coalesce(nullif(p_data->>'overtime','')::numeric,0)+coalesce(nullif(p_data->>'bonus','')::numeric,0);
   deduction:=coalesce(nullif(p_data->>'deduction','')::numeric,0); advance_deduction:=coalesce(nullif(p_data->>'advance_deduction','')::numeric,0);
   if advance_deduction>balance then raise exception 'Potongan kasbon melebihi sisa'; end if;
   amount:=gross-deduction-advance_deduction;
 else amount:=(p_data->>'amount')::numeric; end if;
 perform public.assert_amount(amount,p_kind='payroll');
 if p_kind='advance_repayment' and amount>balance then raise exception 'Pengembalian melebihi sisa kasbon'; end if;
 insert into public.operations(id,kind,operation_date,status,account_id,amount,note,payload,created_by,finalized_by) values(p_id,p_kind,dt,'final',acc,amount,nullif(p_data->>'note',''),p_data,auth.uid(),auth.uid());
 perform public.move_cash(p_id,p_kind,dt,acc,case when p_kind='advance_repayment' then amount else -amount end,p_data->>'note');
 return p_id;
end $$;
revoke all on function public.post_hr(uuid,text,jsonb) from public,anon;
grant execute on function public.post_hr(uuid,text,jsonb) to authenticated;

-- Validasi kategori aset/pinjaman berada di transaksi yang sama dengan posting kas.
alter function public.save_operation(uuid,text,jsonb,boolean) rename to save_operation_internal;
revoke all on function public.save_operation_internal(uuid,text,jsonb,boolean) from authenticated;
create function public.save_operation(p_id uuid,p_kind text,p_data jsonb,p_final boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare category text; asset public.fixed_assets%rowtype; loan text; balance numeric;
begin
 perform public.lock_operations();
 if not public.office_access() and not (p_kind='production' and public.has_app_role(array['production'])) and not (p_kind='deposit' and public.has_app_role(array['collector'])) then raise exception 'Tidak memiliki akses'; end if;
 if exists(select 1 from public.operations where id=p_id and status<>'draft') then return public.save_operation_internal(p_id,p_kind,p_data,p_final); end if;
 category:=p_data->>'category';
 if p_kind='finance' then
   if category='fixed_asset' and length(trim(coalesce(p_data->>'asset_name',''))) not between 1 and 200 then raise exception 'Nama aset wajib diisi'; end if;
   if category='asset_sale' then
     select * into asset from public.fixed_assets where id=nullif(p_data->>'asset','')::uuid;
     if not found or asset.disposed_by is not null then raise exception 'Aset tidak tersedia'; end if;
     perform public.assert_amount(nullif(p_data->>'book_value','')::numeric,true);
     if (p_data->>'book_value')::numeric>asset.cost then raise exception 'Nilai buku melebihi harga perolehan'; end if;
   end if;
   if category in ('loan_received','loan_principal','interest') then
     loan:=trim(p_data->>'loan_reference');
     if length(coalesce(loan,'')) not between 1 and 200 then raise exception 'Referensi pinjaman wajib diisi'; end if;
     if category='loan_principal' then
       select coalesce(sum(case when category='loan_received' then amount else -amount end),0) into balance from public.operations where kind='finance' and status='final' and category in ('loan_received','loan_principal') and payload->>'loan_reference'=loan;
       if (p_data->>'amount')::numeric>balance then raise exception 'Angsuran pokok melebihi sisa pinjaman'; end if;
     end if;
   end if;
 end if;
 perform public.save_operation_internal(p_id,p_kind,p_data,p_final);
 if p_kind='finance' and p_final then
   if category='fixed_asset' then insert into public.fixed_assets(id,name,acquisition_date,cost) values(p_id,trim(p_data->>'asset_name'),(p_data->>'date')::date,(p_data->>'amount')::numeric);
   elsif category='asset_sale' then update public.fixed_assets set disposed_by=p_id,book_value_at_disposal=(p_data->>'book_value')::numeric where id=asset.id; end if;
 end if;
 return p_id;
end $$;
revoke all on function public.save_operation(uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.save_operation(uuid,text,jsonb,boolean) to authenticated;

create function public.save_finance_category(p_code text,p_name text,p_direction text,p_classification text,p_active boolean) returns text language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner']) then raise exception 'Tidak memiliki akses'; end if;
 if p_code is null or p_code !~ '^custom_[a-z0-9_]{1,30}$' or length(trim(coalesce(p_name,''))) not between 1 and 100 or p_direction is null or p_direction not in ('in','out') or p_classification is null or p_classification not in ('income','expense','equity','owner') or p_active is null then raise exception 'Kategori tidak valid'; end if;
 if exists(select 1 from public.finance_categories where code=p_code and (direction<>p_direction or classification<>p_classification)) then raise exception 'Klasifikasi kategori tidak dapat diubah'; end if;
 insert into public.finance_categories values(p_code,trim(p_name),p_direction,p_classification,p_active) on conflict(code) do update set name=excluded.name,active=excluded.active;
 return p_code;
end $$;
revoke all on function public.save_finance_category(text,text,text,text,boolean) from public,anon;
grant execute on function public.save_finance_category(text,text,text,text,boolean) to authenticated;
create trigger audit_categories after insert or update on public.finance_categories for each row execute function public.audit_master_change();

create table public.document_attachments (
 id uuid primary key default gen_random_uuid(), source_id uuid not null,
 storage_path text not null unique, file_name text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.document_attachments enable row level security;
revoke all on public.document_attachments from public,anon,authenticated;
grant select,insert on public.document_attachments to authenticated;
create function public.can_access_document(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_read_operation(p_id) or (public.office_access() and (exists(select 1 from public.purchase_dos where id=p_id) or exists(select 1 from public.purchase_receipts where id=p_id)))
$$;
revoke all on function public.can_access_document(uuid) from public,anon;
grant execute on function public.can_access_document(uuid) to authenticated;
create policy attachments_read on public.document_attachments for select to authenticated using(public.can_access_document(source_id));
create policy attachments_insert on public.document_attachments for insert to authenticated with check(created_by=auth.uid() and public.can_access_document(source_id) and storage_path like source_id::text||'/%' and length(file_name) between 1 and 200 and exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=storage_path));
create trigger audit_attachments after insert on public.document_attachments for each row execute function public.audit_master_change();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('transaction-evidence','transaction-evidence',false,10485760,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='transaction-evidence' and public.can_access_document((storage.foldername(name))[1]::uuid));
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='transaction-evidence' and public.can_access_document((storage.foldername(name))[1]::uuid));
create policy evidence_cleanup on storage.objects for delete to authenticated using(bucket_id='transaction-evidence' and owner_id=auth.uid()::text and not exists(select 1 from public.document_attachments a where a.storage_path=name));
notify pgrst,'reload schema';
commit;
