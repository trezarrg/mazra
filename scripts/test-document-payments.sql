-- Fixtures roll back and use explicit document numbers; no live counters advance.
begin;
set local session_replication_role=replica;
do $$
declare
 actor uuid; partner uuid:=gen_random_uuid(); account uuid:=gen_random_uuid();
 unpaid uuid:=gen_random_uuid(); partial uuid:=gen_random_uuid(); paid uuid:=gen_random_uuid();
 draft uuid:=gen_random_uuid(); corrected uuid:=gen_random_uuid(); production uuid:=gen_random_uuid();
 base_no bigint:=-800000000000000000-(random()*1000000)::bigint;
begin
 select id into actor from public.profiles where active and role in ('developer','owner','admin') limit 1;
 if actor is null then raise exception 'Profil pengelola diperlukan'; end if;
 insert into public.partners(id,name,is_customer) values(partner,'Uji dokumen pembayaran',true);
 insert into public.operations(id,document_no,kind,operation_date,status,partner_id,amount,payload,created_by)
 overriding system value values
 (unpaid,base_no,'sale',current_date,'final',partner,100,'{}',actor),
 (partial,base_no-1,'sale',current_date,'final',partner,100,'{}',actor),
 (paid,base_no-2,'sale',current_date,'final',partner,100,'{}',actor),
 (draft,base_no-3,'sale',current_date,'draft',partner,100,'{}',actor),
 (corrected,base_no-4,'sale',current_date,'final',partner,100,'{}',actor),
 (production,base_no-5,'production',current_date,'final',null,0,'{}',actor);
 update public.operations set reversed_by=gen_random_uuid() where id=corrected;
 insert into public.payments(id,kind,source_id,payment_date,account_id,amount,payload,created_by) values
 (gen_random_uuid(),'receivable',partial,current_date,account,40,'{}',actor),
 (gen_random_uuid(),'receivable',paid,current_date,account,100,'{}',actor);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 execute 'set local role authenticated';
 if (select payment_state from public.sales_purchase_documents where id=unpaid) is distinct from 'unpaid'
 or (select payment_state from public.sales_purchase_documents where id=partial) is distinct from 'unpaid'
 or (select payment_state from public.sales_purchase_documents where id=paid) is distinct from 'paid' then
   raise exception 'Status penjualan belum bayar/cicilan/lunas tidak sesuai';
 end if;
 if exists(select 1 from public.sales_purchase_documents where id in (draft,production)) then
   raise exception 'Draft atau produksi masuk daftar';
 end if;
 if (select payment_state from public.sales_purchase_documents where id=corrected) is distinct from 'cancelled' then
   raise exception 'Dokumen dibatalkan harus tetap terbaca dengan status cancelled';
 end if;
 if exists(select 1 from public.sales_purchase_documents d join public.obligations b on b.source_id=d.id and b.kind='payable'
   where d.kind='purchase_receipt' and d.payment_state<>case when b.balance_amount<=0 then 'paid' else 'unpaid' end) then
   raise exception 'Status pembelian tidak sesuai sisa hutang';
 end if;
 if has_table_privilege('anon','public.sales_purchase_documents','select') then
   raise exception 'Dokumen dapat dibaca anonim';
 end if;
 execute 'reset role';
end $$;
select 'Status penjualan, cicilan, pembelian, cakupan dokumen, dan akses lulus' as result;
rollback;
