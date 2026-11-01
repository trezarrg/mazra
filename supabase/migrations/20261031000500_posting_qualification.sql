begin;
create or replace function public.post_hr(p_id uuid,p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 select coalesce(sum(case when o.kind='advance' then o.amount when o.kind='advance_repayment' then -o.amount when o.kind='payroll' then -coalesce((o.payload->>'advance_deduction')::numeric,0) else 0 end),0) into balance from public.operations o where o.status='final' and o.payload->>'employee'=emp::text;
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

create or replace function public.save_operation(p_id uuid,p_kind text,p_data jsonb,p_final boolean) returns uuid language plpgsql security definer set search_path='' as $$
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
       select coalesce(sum(case when o.category='loan_received' then o.amount else -o.amount end),0) into balance from public.operations o where o.kind='finance' and o.status='final' and o.category in ('loan_received','loan_principal') and o.payload->>'loan_reference'=loan;
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
notify pgrst,'reload schema';
commit;
