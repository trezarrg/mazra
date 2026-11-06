-- Fixture memakai nomor DO eksplisit dan trigger audit dinonaktifkan pada transaksi ini;
-- rollback mengembalikan seluruh data tanpa mengonsumsi urutan nomor dokumen/audit.
begin;
set local session_replication_role=replica;
create function pg_temp.assert_receiving(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Uji antrean gagal: %',label; end if; end $$;
create function pg_temp.expect_receiving_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise exception 'Kesalahan berbeda dari harapan (%): %',expected,sqlerrm;
 end;
 raise exception 'Operasi seharusnya ditolak: %',expected;
end $$;
do $$
declare
 actor uuid; production uuid:=gen_random_uuid(); other_driver uuid:=gen_random_uuid();
 supplier uuid:=gen_random_uuid(); product uuid:=gen_random_uuid();
 direct_do uuid:=gen_random_uuid(); pending_do uuid:=gen_random_uuid(); cancelled_do uuid:=gen_random_uuid(); closed_do uuid:=gen_random_uuid();
 direct_receipt uuid:=gen_random_uuid(); measured_receipt uuid:=gen_random_uuid(); next_receipt uuid:=gen_random_uuid();
 measurement uuid:=gen_random_uuid(); cancelled_measurement uuid:=gen_random_uuid(); additional_measurement uuid:=gen_random_uuid();
 base_no bigint:=-900000000000000000-(random()*1000000)::bigint; label jsonb;
begin
 select id into actor from public.profiles where active and role in ('developer','owner','admin') limit 1;
 perform pg_temp.assert_receiving(actor is not null,'profil pengelola tersedia');
 insert into auth.users(id,email,email_confirmed_at) values
 (production,'queue-production-'||production||'@example.invalid',now()),
 (other_driver,'queue-other_driver-'||other_driver||'@example.invalid',now());
 insert into public.profiles(id,full_name,role,active) values(production,'Uji Timbang','production',true),(other_driver,'Uji Sopir Lain','driver',true);
 insert into public.partners(id,name,is_supplier) values(supplier,'Supplier Uji Antrean',true);
 insert into public.products(id,name) values(product,'Ayam Uji Antrean');
 insert into public.product_units(product_id,unit) values(product,'kg');
 insert into public.purchase_dos(id,document_no,purchase_date,supplier_id,product_id,price_method,price,created_by,status)
 overriding system value values
 (direct_do,base_no,current_date,supplier,product,'kg',30000,actor,'open'),
 (pending_do,base_no-1,current_date,supplier,product,'kg',30000,actor,'open'),
 (cancelled_do,base_no-2,current_date,supplier,product,'kg',30000,actor,'open'),
 (closed_do,base_no-3,current_date,supplier,product,'kg',30000,actor,'closed');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.confirm_purchase_receipt(direct_receipt,direct_do,current_date,10,9,9,null,'Catatan harga rahasia');

 perform set_config('request.jwt.claim.sub',production::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_receiving((select count(*)=2 from public.receiving_queue() where id in (pending_do,cancelled_do)),'DO belum diterima muncul');
 perform pg_temp.assert_receiving(not exists(select 1 from public.receiving_queue() where id in (direct_do,closed_do)),'DO diterima dan ditutup tidak muncul');
 select to_jsonb(q) into label from public.receiving_queue() q where q.id=pending_do;
 perform pg_temp.assert_receiving(not (label ? 'price') and not (label ? 'bill_amount'),'harga dan tagihan tidak terlihat pada antrean');
 perform pg_temp.assert_receiving((select count(*)=0 from public.purchase_dos),'petugas timbang tidak dapat membaca harga DO');
 perform pg_temp.assert_receiving((select count(*)=1 from public.receiving_history() where id=direct_receipt and status='received' and note is null),'riwayat membedakan penerimaan langsung tanpa catatan rahasia');
 perform pg_temp.expect_receiving_error(format('select public.record_queue_measurement(%L,%L,current_date,null,9,null)',gen_random_uuid(),direct_do),'sudah diterima di Pembelian');
 perform public.record_queue_measurement(measurement,pending_do,current_date,10,9,'Hasil timbang');
 perform public.record_queue_measurement(measurement,pending_do,current_date,10,9,'Hasil timbang');
 perform pg_temp.assert_receiving(not exists(select 1 from public.receiving_queue() where id=pending_do),'DO bertimbang menunggu konfirmasi tidak muncul');
 perform pg_temp.assert_receiving((select count(*)=1 from public.receiving_history() where id=measurement and status='pending'),'hasil timbang menunggu di riwayat');
 perform pg_temp.expect_receiving_error(format('select public.record_queue_measurement(%L,%L,current_date,null,9,null)',gen_random_uuid(),pending_do),'menunggu konfirmasi');
 perform pg_temp.expect_receiving_error(format('select public.confirm_measurement(%L,%L,9,null,null)',measured_receipt,measurement),'Tidak memiliki akses');
 execute 'reset role';
 perform pg_temp.assert_receiving((select coalesce(sum(quantity),0)=9 from public.stock_movements where product_id=product),'timbang menunggu belum mengubah stok');

 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_temp.expect_receiving_error(format('select public.confirm_purchase_receipt(%L,%L,current_date,10,9,9,null,null)',gen_random_uuid(),pending_do),'hasil timbang menunggu konfirmasi');
 perform public.confirm_measurement(measured_receipt,measurement,9,null,null);
 perform public.confirm_measurement(measured_receipt,measurement,9,null,null);
 perform pg_temp.expect_receiving_error(format('select public.confirm_measurement(%L,%L,9,null,null)',gen_random_uuid(),measurement),'sudah dikonfirmasi');
 perform public.confirm_purchase_receipt(measured_receipt,pending_do,current_date,10,9,9,null,'Hasil timbang');
 perform pg_temp.assert_receiving((select actual_weight=9 and billing_quantity=9 and bill_amount=270000 from public.purchase_receipts where id=measured_receipt),'konfirmasi memakai netto dan tagihan yang benar');
 perform pg_temp.assert_receiving((select coalesce(sum(quantity),0)=18 from public.stock_movements where product_id=product),'konfirmasi menambah stok sekali');
 perform pg_temp.assert_receiving((select count(*)=1 from public.receiving_history() where do_id=pending_do and status='accepted'),'riwayat tidak menggandakan timbang yang diterima');
 perform public.confirm_purchase_receipt(next_receipt,pending_do,current_date,null,1,1,null,'Pengiriman berikutnya');
 perform pg_temp.assert_receiving((select coalesce(sum(quantity),0)=19 from public.stock_movements where product_id=product),'penerimaan berikutnya pada DO yang sama tetap tersedia');
 perform pg_temp.assert_receiving((select count(*)=2 from public.receiving_history() where do_id=pending_do and status in ('accepted','received')),'pengiriman tambahan dibedakan di riwayat');

 perform set_config('request.jwt.claim.sub',production::text,true);
 execute 'set local role authenticated';
 perform public.record_queue_measurement(cancelled_measurement,cancelled_do,current_date,null,8,null);
 perform public.cancel_measurement(cancelled_measurement,'Berat perlu diperbaiki');
 perform pg_temp.assert_receiving(exists(select 1 from public.receiving_queue() where id=cancelled_do),'DO kembali ke antrean setelah timbang dibatalkan');
 perform pg_temp.assert_receiving(exists(select 1 from public.receiving_history() where id=cancelled_measurement and status='cancelled'),'pembatalan tetap di riwayat');
 perform public.record_measurement(additional_measurement,pending_do,current_date,null,1,'Pengiriman tambahan');
 perform pg_temp.assert_receiving(exists(select 1 from public.receiving_history() where id=additional_measurement and status='pending'),'fungsi timbang lama tetap mendukung pengiriman tambahan');
 perform public.cancel_measurement(additional_measurement,'Uji selesai');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_temp.expect_receiving_error(format('select public.confirm_measurement(%L,%L,8,null,null)',gen_random_uuid(),cancelled_measurement),'tidak tersedia');
 perform set_config('request.jwt.claim.sub',other_driver::text,true);
 execute 'set local role authenticated';
 perform pg_temp.expect_receiving_error('select * from public.receiving_queue()','Tidak memiliki akses');
 perform pg_temp.expect_receiving_error('select * from public.receiving_history()','Tidak memiliki akses');
 perform pg_temp.expect_receiving_error(format('select public.record_queue_measurement(%L,%L,current_date,null,8,null)',gen_random_uuid(),cancelled_do),'Tidak memiliki akses');
 execute 'reset role';
 perform pg_temp.assert_receiving(not has_function_privilege('anon','public.receiving_queue()','execute') and not has_function_privilege('anon','public.receiving_history()','execute') and not has_function_privilege('anon','public.record_queue_measurement(uuid,uuid,date,numeric,numeric,text)','execute'),'akses anonim ditolak');
end $$;
rollback;
