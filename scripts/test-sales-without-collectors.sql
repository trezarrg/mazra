-- All fixtures and transactional identity restarts are rolled back.
begin;
set local session_replication_role=replica;
do $$ begin execute format('alter sequence %s restart with 9000000000000000000',pg_get_serial_sequence('public.operations','document_no')); end $$;
create function pg_temp.assert_sales(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Uji penjualan gagal: %',label; end if; end $$;
create function pg_temp.reject_sales(statement text,message text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if position(message in sqlerrm)>0 then return; end if;
   raise exception 'Pesan berbeda: %',sqlerrm;
 end;
 raise exception 'Seharusnya ditolak: %',message;
end $$;
do $$
declare
 actor uuid; driver uuid:=gen_random_uuid(); other_driver uuid:=gen_random_uuid(); partner uuid:=gen_random_uuid();
 product uuid:=gen_random_uuid(); account uuid:=gen_random_uuid();
 order_id uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); sale uuid:=gen_random_uuid(); delivery uuid:=gen_random_uuid();
 pay1 uuid:=gen_random_uuid(); pay2 uuid:=gen_random_uuid(); count_sale uuid:=gen_random_uuid();
 line_id uuid; data jsonb; count_data jsonb; sent jsonb; dt date:='2099-11-05';
 base_no bigint:=-600000000000000000-(random()*1000000)::bigint;
begin
 select id into actor from public.profiles where active and role in ('developer','owner') limit 1;
 perform pg_temp.assert_sales(actor is not null,'pengelola tersedia');
 insert into auth.users(id,email,email_confirmed_at) values(driver,'sale-driver-'||driver||'@example.invalid',now()),(other_driver,'sale-driver-'||other_driver||'@example.invalid',now());
 insert into public.profiles(id,full_name,role) values(driver,'Uji sopir','driver'),(other_driver,'Uji sopir lain','driver');
 insert into public.partners(id,name,is_customer,is_supplier) values(partner,'Uji penjualan tempo',true,true);
 insert into public.products(id,name) values(product,'Ayam hidup uji tempo');
 insert into public.product_units(product_id,unit) values(product,'kg'),(product,'ekor'),(product,'pcs');
 insert into public.cash_accounts(id,name,account_type) values(account,'Kas uji tempo','cash');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.purchase_dos(id,document_no,purchase_date,supplier_id,product_id,price_method,price,created_by,status)
 overriding system value values(order_id,base_no,dt,partner,product,'kg',30000,actor,'open');
 perform public.confirm_purchase_receipt(receipt,order_id,dt,null,100,100,null,null);
 perform pg_temp.assert_sales(exists(select 1 from public.sales_purchase_documents where id=receipt and payment_state='unpaid'),'invoice pembelian tersedia sebelum dibayar');
 data:=jsonb_build_object('date',dt,'partner',partner,'driver',driver,'paid','0','due',dt+7,'items',jsonb_build_array(jsonb_build_object('product',product,'unit','kg','quantity','10','price','30000')));
 perform public.save_operation(sale,'sale',data,false);
 perform pg_temp.assert_sales((select balance::numeric=100 from public.stock_balances where product_id=product),'draft tidak mengubah stok');
 perform public.save_operation(sale,'sale',data,true);
 perform public.save_operation(sale,'sale',data,true);
 perform pg_temp.assert_sales((select balance::numeric=90 from public.stock_balances where product_id=product),'invoice mengurangi stok sekali');
 perform pg_temp.assert_sales((select balance_amount=300000 and paid::numeric=0 and due_date=dt+7 from public.obligations where source_id=sale),'Rp0 membentuk piutang penuh dan tempo');
 perform pg_temp.assert_sales(not exists(select 1 from public.payments where source_id=sale) and not exists(select 1 from public.cash_movements where source_id=sale),'Rp0 tidak membuat pembayaran atau kas');
 perform pg_temp.assert_sales(exists(select 1 from public.sales_list where id=sale and payment_state='unpaid') and exists(select 1 from public.sales_purchase_documents where id=sale and payment_state='unpaid'),'invoice dan daftar menandai belum lunas');
 select id into line_id from public.operation_items where operation_id=sale;
 sent:=jsonb_build_array(jsonb_build_object('item',line_id,'quantity','10'));
 perform set_config('request.jwt.claim.sub',driver::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_sales((select count(*)=1 from public.sales_list where id=sale),'sopir melihat tugas sendiri');
 perform public.record_delivery(delivery,sale,dt,'sent',sent,null);
 perform public.record_delivery(delivery,sale,dt,'sent',sent,null);
 perform public.record_delivery(gen_random_uuid(),sale,dt,'received',sent,null);
 perform pg_temp.reject_sales(format('select public.post_payment(%L,%L,%L,%L,%L,1000,null)',gen_random_uuid(),'receivable',sale,dt,account),'Tidak memiliki akses');
 execute 'reset role';
 perform pg_temp.assert_sales((select count(*)=2 from public.delivery_events where sale_id=sale),'kirim dan terima sebelum pembayaran tanpa duplikasi');
 perform pg_temp.assert_sales((select balance::numeric=90 from public.stock_balances where product_id=product),'pengiriman tidak mengurangi stok kedua kali');
 perform set_config('request.jwt.claim.sub',other_driver::text,true);
 execute 'set local role authenticated';
 perform pg_temp.assert_sales(not exists(select 1 from public.sales_list where id=sale),'sopir lain tidak melihat invoice');
 perform pg_temp.reject_sales(format('select public.record_delivery(%L,%L,%L,%L,%L,null)',gen_random_uuid(),sale,dt,'sent',sent),'Tidak memiliki akses');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.post_payment(pay1,'receivable',sale,dt+2,account,100000,'Cicilan');
 perform public.post_payment(pay1,'receivable',sale,dt+2,account,100000,'Cicilan');
 perform pg_temp.assert_sales((select balance_amount=200000 from public.obligations where source_id=sale),'cicilan menyisakan piutang yang benar');
 update public.cash_accounts set active=false where id=account;
 perform pg_temp.reject_sales(format('select public.post_payment(%L,%L,%L,%L,%L,200000,null)',pay2,'receivable',sale,dt+7,account),'Gunakan kas kantor atau bank');
 update public.cash_accounts set active=true where id=account;
 perform public.post_payment(pay2,'receivable',sale,dt+7,account,200000,'Pelunasan');
 perform pg_temp.assert_sales((select balance_amount=0 from public.obligations where source_id=sale),'piutang lunas');
 perform pg_temp.assert_sales((select balance::numeric=300000 from public.cash_balances where account_id=account),'kas sesuai uang diterima');
 perform pg_temp.assert_sales(exists(select 1 from public.sales_list where id=sale and payment_state='paid') and exists(select 1 from public.sales_purchase_documents where id=sale and payment_state='paid'),'invoice dan daftar berubah lunas');
 perform pg_temp.reject_sales(format('select public.post_payment(%L,%L,%L,%L,%L,1,null)',gen_random_uuid(),'receivable',sale,dt,account),'Pembayaran melebihi');
 count_data:=jsonb_build_object('date',dt,'partner',partner,'paid','0','items',jsonb_build_array(jsonb_build_object('product',product,'unit','ekor','quantity','2','weight','4','price','40000')));
 perform public.save_operation(count_sale,'sale',count_data,true);
 perform pg_temp.assert_sales((select amount=80000 from public.operations where id=count_sale) and (select balance::numeric=86 from public.stock_balances where product_id=product),'harga per ekor tetap mengurangi stok kg');
 perform pg_temp.reject_sales(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'sale',count_data||'{"paid":"10000"}'::jsonb),'Gunakan kas kantor atau bank');
 perform pg_temp.assert_sales((select balance::numeric=86 from public.stock_balances where product_id=product),'akun pembayaran wajib; kegagalan atomik');
 perform pg_temp.reject_sales(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'sale',jsonb_set(count_data,'{items,0,weight}','"1000"')),'Stok Ayam hidup uji tempo tidak cukup.');
 perform pg_temp.assert_sales((select balance::numeric=86 from public.stock_balances where product_id=product),'pesan stok menyebut produk dan posting gagal tetap atomik');
 perform pg_temp.reject_sales(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'sale',data||jsonb_build_object('assigned',driver)),'Penugasan penagih tidak digunakan');
 perform pg_temp.reject_sales(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'deposit','{}'::jsonb),'Jenis transaksi tidak valid');
 perform pg_temp.reject_sales(format('select public.add_team_access(%L,%L,array[%L])','unused@example.invalid','Uji','collector'),'Data pengguna tidak valid');
 perform pg_temp.reject_sales(format('select public.save_team_access(%L,%L,array[%L],true)',driver,'Uji','collector'),'Data pengguna tidak valid');
 perform pg_temp.reject_sales(format('select public.provision_profile(%L,%L,%L)','unused@example.invalid','Uji','collector'),'Data pengguna tidak valid');
 perform pg_temp.reject_sales(format('insert into public.profiles(id,full_name,role) values(%L,%L,%L)',gen_random_uuid(),'Uji','collector'),'profiles_role_check');
 perform pg_temp.reject_sales(format('insert into public.profile_extra_roles(profile_id,role) values(%L,%L)',driver,'collector'),'profile_extra_roles_role_check');
 perform pg_temp.reject_sales(format('insert into public.cash_accounts(id,name,account_type) values(%L,%L,%L)',gen_random_uuid(),'Uji','collector'),'cash_accounts_account_type_check');
 perform pg_temp.assert_sales(to_regprocedure('public.verify_deposit(uuid,boolean,text)') is null,'RPC verifikasi setoran dihapus');
 perform pg_temp.assert_sales(not exists(select 1 from pg_policies where schemaname='public' and (qual ilike '%collector%' or with_check ilike '%collector%')),'RLS tidak menyisakan akses penagih');
end $$;
select 'Lulus: Rp0, invoice, kirim dahulu, cicilan, pelunasan, kg/ekor, akses sopir, dan penolakan fitur penagih.' as result;
rollback;
