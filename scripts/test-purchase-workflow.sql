-- Pemeriksaan baca saja; transaksi selalu di-rollback dan tidak mengubah transaksi usaha.
begin;
do $$
declare actor uuid; expected_receipts bigint; expected_orders bigint; expected_due numeric; actual_due numeric;
begin
 select count(*) into expected_receipts from public.purchase_receipts;
 select count(*) into expected_orders from public.purchase_dos;
 select coalesce(sum(balance_amount),0) into expected_due from public.obligations
 where kind='payable' and balance_amount>0
 and due_date between (now() at time zone 'Asia/Jakarta')::date and (now() at time zone 'Asia/Jakarta')::date+3;
 if exists (
   select 1 from public.workflow_documents d join public.obligations b on b.source_id=d.id and b.kind='payable'
   where d.kind='purchase_receipt' and ((d.payment_state='paid') is distinct from (b.balance_amount<=0))
 ) then raise exception 'Status dokumen tidak sesuai sisa tagihan'; end if;
 if exists (
   select 1 from public.purchase_workflow d
   where d.payment_state='paid' and exists (
     select 1 from public.purchase_receipts r join public.obligations b on b.source_id=r.id and b.kind='payable'
     where r.do_id=d.id and b.balance_amount>0
   )
 ) then raise exception 'DO dengan tagihan tersisa ditandai lunas'; end if;

 select id into actor from public.profiles where active and role in ('developer','owner','admin') limit 1;
 if actor is null then raise exception 'Profil pengelola untuk pemeriksaan tidak tersedia'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.purchase_workflow)<>expected_orders then raise exception 'Daftar DO pengelola tidak lengkap'; end if;
 if (select count(*) from public.workflow_documents where kind='purchase_receipt')<>expected_receipts then raise exception 'Dokumen penerimaan tidak lengkap'; end if;
 select (public.business_summary(null,null)->>'due_next3')::numeric into actual_due;
 if actual_due is distinct from expected_due then raise exception 'Ringkasan jatuh tempo 3 hari tidak sesuai'; end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
 execute 'set local role authenticated';
 if exists(select 1 from public.purchase_workflow) or exists(select 1 from public.workflow_documents where kind='purchase_receipt') then raise exception 'Data pembelian dapat dibaca akun tanpa akses'; end if;
 execute 'reset role';
 execute 'set local role anon';
 if has_table_privilege(current_user,'public.purchase_workflow','select') or has_table_privilege(current_user,'public.workflow_documents','select') then raise exception 'View diberikan ke pengguna anonim'; end if;
 execute 'reset role';
end $$;
rollback;
