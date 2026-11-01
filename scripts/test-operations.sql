-- Test integrasi pada Supabase Cloud. Seluruh fixture, audit, dan transaksi di-rollback.
begin;
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'UAT gagal: %',label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if position(expected in sqlerrm)>0 then return; end if;
   raise exception 'Kesalahan berbeda dari harapan (%): %',expected,sqlerrm;
 end;
 raise exception 'Operasi seharusnya ditolak: %',expected;
end $$;
do $$
declare
 actor uuid; collector uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); production uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
 customer uuid:=gen_random_uuid(); supplier uuid:=gen_random_uuid(); live uuid:=gen_random_uuid(); carcass uuid:=gen_random_uuid(); fillet uuid:=gen_random_uuid(); offal uuid:=gen_random_uuid();
 acc uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); bag uuid:=gen_random_uuid();
 do_id uuid:=gen_random_uuid(); r1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); prod uuid:=gen_random_uuid(); conv uuid:=gen_random_uuid();
 sale uuid:=gen_random_uuid(); collect_sale uuid:=gen_random_uuid(); ret uuid:=gen_random_uuid(); deposit uuid:=gen_random_uuid();
 payment1 uuid:=gen_random_uuid(); payment2 uuid:=gen_random_uuid(); billpay uuid:=gen_random_uuid();
 employee uuid:=gen_random_uuid(); advance uuid:=gen_random_uuid(); payroll uuid:=gen_random_uuid(); asset uuid:=gen_random_uuid();
 sale_data jsonb; data jsonb; item_id uuid; qty numeric; before_cash numeric; after_cash numeric; s jsonb; reversal uuid:=gen_random_uuid(); new_ret uuid:=gen_random_uuid(); purchase_ret uuid:=gen_random_uuid(); driver_sale uuid:=gen_random_uuid(); delivery uuid:=gen_random_uuid(); multi uuid:=gen_random_uuid(); full_ret uuid:=gen_random_uuid(); lump_do uuid:=gen_random_uuid(); lump_receipt uuid:=gen_random_uuid(); owner_actor uuid:=gen_random_uuid(); disposal uuid:=gen_random_uuid();
begin
 select id into actor from public.profiles where role='developer' and active limit 1;
 perform pg_temp.check_that(actor is not null,'profil pengelola tersedia');
 insert into auth.users(id,email,email_confirmed_at) values(collector,'uat-collector-'||collector||'@example.invalid',now()),(driver,'uat-driver-'||driver||'@example.invalid',now()),(production,'uat-production-'||production||'@example.invalid',now()),(inactive,'uat-inactive-'||inactive||'@example.invalid',now()),(owner_actor,'uat-owner-'||owner_actor||'@example.invalid',now());
 insert into public.profiles(id,full_name,role,active) values(collector,'UAT Penagih','collector',true),(driver,'UAT Sopir','driver',true),(production,'UAT Produksi','production',true),(inactive,'UAT Nonaktif','admin',false),(owner_actor,'UAT Owner','owner',true);
 insert into public.partners(id,name,is_customer,is_supplier) values(customer,'UAT Pelanggan',true,false),(supplier,'UAT Supplier',false,true);
 insert into public.products(id,name) values(live,'UAT Hidup'),(carcass,'UAT Karkas'),(fillet,'UAT Fillet'),(offal,'UAT Jeroan');
 insert into public.product_units(product_id,unit) values(live,'kg'),(live,'ekor'),(carcass,'kg'),(fillet,'kg'),(offal,'kg');
 insert into public.cash_accounts(id,name,account_type,holder_id) values(acc,'UAT Kantor','cash',null),(bank,'UAT Bank','bank',null),(bag,'UAT Penagih','collector',collector);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 -- 1–3. DO tanpa posting, selisih -20 kg, dua penerimaan, retry identik.
 perform public.create_purchase_do(do_id,'2026-10-31',supplier,live,null,1000,null,'kg',20000,null);
 perform pg_temp.check_that(not exists(select 1 from public.stock_movements where product_id=live),'DO tidak mengubah stok');
 perform public.confirm_purchase_receipt(r1,do_id,'2026-10-31',1000,980,1000,null,null);
 perform public.confirm_purchase_receipt(r1,do_id,'2026-10-31',1000,980,1000,null,null);
 perform pg_temp.check_that((select sum(quantity)=980 from public.stock_movements where product_id=live),'stok mengikuti netto 980');
 perform pg_temp.check_that((select actual_weight-origin_weight=-20 from public.purchase_receipts where id=r1),'selisih netto -20');
 perform public.confirm_purchase_receipt(r2,do_id,'2026-10-31',null,20,20,null,null);
 perform pg_temp.check_that((select sum(quantity)=1000 and count(*)=2 from public.stock_movements where product_id=live),'dua penerimaan tanpa duplikasi');
 -- Modal dan pinjaman tidak menjadi pendapatan.
 data:=jsonb_build_object('date','2026-10-31','category','capital','account',acc,'amount','20000000','note','Modal UAT');
 perform public.save_operation(gen_random_uuid(),'finance',data,true);
 -- 4–5. Produksi dan konversi tidak menggandakan input.
 data:=jsonb_build_object('date','2026-10-31','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','500','direction','out'),jsonb_build_object('product',carcass,'unit','kg','quantity','350','direction','in'),jsonb_build_object('product',fillet,'unit','kg','quantity','80','direction','in'),jsonb_build_object('product',offal,'unit','kg','quantity','50','direction','in')));
 perform public.save_operation(prod,'production',data,true);perform public.save_operation(prod,'production',data,true);
 perform pg_temp.check_that((select sum(quantity)=500 from public.stock_movements where product_id=live),'bahan turun 500 sekali');
 data:=jsonb_build_object('date','2026-10-31','items',jsonb_build_array(jsonb_build_object('product',carcass,'unit','kg','quantity','100','direction','out'),jsonb_build_object('product',fillet,'unit','kg','quantity','90','direction','in')));
 perform public.save_operation(conv,'production',data,true);
 perform pg_temp.check_that((select sum(quantity)=250 from public.stock_movements where product_id=carcass),'karkas terkonversi berkurang');
 -- 6–7. Penjualan tempo, draft, pembayaran parsial dan pelunasan.
 sale_data:=jsonb_build_object('date','2026-10-31','partner',customer,'due','2026-10-31','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','100','price','30000')));
 perform public.save_operation(sale,'sale',sale_data,false);
 perform pg_temp.check_that((select sum(quantity)=500 from public.stock_movements where product_id=live),'draft penjualan tidak mengubah stok');
 select sum(amount) into before_cash from public.cash_movements where account_id=acc;
 perform public.save_operation(sale,'sale',sale_data,true);perform public.save_operation(sale,'sale',sale_data,true);
 perform pg_temp.check_that((select sum(quantity)=400 from public.stock_movements where product_id=live),'penjualan stok turun 100');
 perform pg_temp.check_that((select balance_amount=3000000 from public.obligations where source_id=sale),'piutang penjualan tempo');
 perform pg_temp.check_that((select sum(amount)=before_cash from public.cash_movements where account_id=acc),'tempo tidak menambah kas');
 perform public.post_payment(payment1,'receivable',sale,'2026-10-31',acc,1000000,null);
 perform public.post_payment(payment1,'receivable',sale,'2026-10-31',acc,1000000,null);
 perform public.post_payment(payment2,'receivable',sale,'2026-10-31',acc,2000000,null);
 perform pg_temp.check_that((select balance_amount=0 and paid::numeric=3000000 from public.obligations where source_id=sale),'piutang lunas tanpa duplikasi');
 perform pg_temp.expect_error(format('select public.post_payment(%L,''receivable'',%L,''2026-10-31'',%L,1,null)',gen_random_uuid(),sale,acc),'Pembayaran melebihi');
 -- Retur terbayar mengembalikan dana, stok, dan menyimpan asal.
 select id into item_id from public.operation_items where operation_id=sale;
 data:=jsonb_build_object('date','2026-10-31','source',sale,'account',acc,'note','Retur UAT','items',jsonb_build_array(jsonb_build_object('source_item',item_id,'quantity','5')));
 perform public.save_operation(ret,'sale_return',data,true);perform public.save_operation(ret,'sale_return',data,true);
 perform pg_temp.check_that((select refund_amount=150000 from public.operations where id=ret),'retur dana terbayar');
 perform pg_temp.check_that((select balance_amount=0 from public.obligations where source_id=sale),'retur tidak membuat saldo negatif');
 -- 8. Penagih 5 juta, setor 3 juta; verifikator berbeda.
 data:=sale_data||jsonb_build_object('assigned',collector,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','100','price','50000')));
 perform public.save_operation(collect_sale,'sale',data,true);
 perform set_config('request.jwt.claim.sub',collector::text,true);
 perform public.post_payment(gen_random_uuid(),'receivable',collect_sale,'2026-10-31',bag,5000000,null);
 data:=jsonb_build_object('date','2026-10-31','account',bag,'target',acc,'amount','3000000');
 perform public.save_operation(deposit,'deposit',data,true);
 perform pg_temp.check_that((select sum(amount)=5000000 from public.cash_movements where account_id=bag),'setoran menunggu tidak memindahkan uang');
 perform pg_temp.expect_error(format('select public.verify_deposit(%L,true,null)',deposit),'Tidak memiliki akses');
 -- Rangkap admin sekalipun tidak dapat memverifikasi setoran sendiri.
 insert into public.profile_extra_roles(profile_id,role) values(collector,'admin');
 perform pg_temp.expect_error(format('select public.verify_deposit(%L,true,null)',deposit),'setoran sendiri');
 delete from public.profile_extra_roles where profile_id=collector;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.verify_deposit(deposit,true,null);perform public.verify_deposit(deposit,true,null);
 perform pg_temp.check_that((select sum(amount)=2000000 from public.cash_movements where account_id=bag),'sisa penagih 2 juta');
 -- 9. Dua cicilan supplier; retry dan overpay.
 perform public.post_payment(billpay,'payable',r1,'2026-10-31',acc,10000000,null);
 perform public.post_payment(billpay,'payable',r1,'2026-10-31',acc,10000000,null);
 perform public.post_payment(gen_random_uuid(),'payable',r1,'2026-10-31',acc,10000000,null);
 perform pg_temp.check_that((select balance_amount=0 from public.obligations where source_id=r1),'hutang supplier lunas');
 -- 10–13. Klasifikasi modal/pinjaman/prive/aset, transfer tidak mengubah total.
 data:=jsonb_build_object('date','2026-10-31','category','loan_received','loan_reference','UAT-001','account',acc,'amount','10000000','note','Pinjaman UAT');perform public.save_operation(gen_random_uuid(),'finance',data,true);
 select sum(amount) into before_cash from public.cash_movements where account_id in(acc,bank);
 data:=jsonb_build_object('date','2026-10-31','account',acc,'target',bank,'amount','2000000');perform public.save_operation(gen_random_uuid(),'transfer',data,true);
 select sum(amount) into after_cash from public.cash_movements where account_id in(acc,bank);perform pg_temp.check_that(before_cash=after_cash,'transfer menjaga total kas');
 data:=jsonb_build_object('date','2026-10-31','category','owner_draw','account',acc,'amount','500000','note','Prive UAT');perform public.save_operation(gen_random_uuid(),'finance',data,true);
 data:=jsonb_build_object('date','2026-10-31','category','fixed_asset','asset_name','Freezer UAT','account',acc,'amount','1000000','note','Freezer');perform public.save_operation(asset,'finance',data,true);perform public.save_operation(asset,'finance',data,true);
 perform pg_temp.check_that((select count(*)=1 from public.fixed_assets where id=asset),'aset dicatat sekali');
 data:=jsonb_build_object('date','2026-10-31','category','loan_principal','loan_reference','UAT-001','account',acc,'amount','2000000','note','Pokok');perform public.save_operation(gen_random_uuid(),'finance',data,true);
 data:=jsonb_build_object('date','2026-10-31','category','interest','loan_reference','UAT-001','account',acc,'amount','200000','note','Bunga');perform public.save_operation(gen_random_uuid(),'finance',data,true);
 -- HR: kasbon bukan biaya dan potong gaji tidak menggandakan biaya.
 perform public.save_employee(employee,'{"name":"UAT Pekerja","type":"daily","rate":"100000","active":true}');
 data:=jsonb_build_object('date','2026-10-31','employee',employee,'account',acc,'amount','500000');perform public.post_hr(advance,'advance',data);
 data:=jsonb_build_object('date','2026-10-31','employee',employee,'account',acc,'period_start','2026-10-01','period_end','2026-10-31','base','1000000','advance_deduction','300000');perform public.post_hr(payroll,'payroll',data);perform public.post_hr(payroll,'payroll',data);
 perform pg_temp.check_that((select advance_balance::numeric=200000 from public.employee_balances where id=employee),'sisa kasbon setelah potong gaji');
 perform pg_temp.expect_error(format('select public.post_hr(%L,''payroll'',%L)',gen_random_uuid(),data),'bertumpang tindih');
 -- Pembalikan menjaga jejak asal dan membuka kembali nilai kewajiban yang tepat.
 perform public.reverse_document(reversal,'operation',payroll,'2026-10-31','Koreksi gaji UAT');
 perform public.reverse_document(reversal,'operation',payroll,'2026-10-31','Koreksi gaji UAT');
 perform pg_temp.check_that((select advance_balance::numeric=500000 from public.employee_balances where id=employee),'pembalikan potong kasbon');
 data:=data||'{"overtime":"","bonus":"","deduction":"","advance_deduction":""}'::jsonb;
 perform public.post_hr(gen_random_uuid(),'payroll',data);
 perform pg_temp.check_that((select advance_balance::numeric=500000 from public.employee_balances where id=employee),'form kosong bukan numeric invalid');
 perform public.reverse_document(gen_random_uuid(),'operation',ret,'2026-10-31','Koreksi retur');
 perform pg_temp.check_that((select balance_amount=0 and credited::numeric=0 from public.obligations where source_id=sale),'pembalikan retur terbayar');
 data:=jsonb_build_object('date','2026-10-31','source',sale,'account',acc,'note','Retur pengganti','items',jsonb_build_array(jsonb_build_object('source_item',item_id,'quantity','5')));
 perform public.save_operation(new_ret,'sale_return',data,true);
 perform pg_temp.check_that((select refund_amount=150000 from public.operations where id=new_ret),'retur pengganti tidak menghitung retur yang dibalik');
 perform public.reverse_document(gen_random_uuid(),'payment',billpay,'2026-10-31','Koreksi cicilan');
 perform pg_temp.check_that((select balance_amount=10000000 from public.obligations where source_id=r1),'pembatalan pembayaran membuka hutang');
 perform public.post_payment(gen_random_uuid(),'payable',r1,'2026-10-31',acc,10000000,null);
 perform pg_temp.check_that((select balance_amount=0 from public.obligations where source_id=r1),'pembayaran pengganti');
 data:=jsonb_build_object('date','2026-10-31','source',r2,'quantity','5','amount','100000','note','Retur supplier');
 perform public.save_operation(purchase_ret,'purchase_return',data,true);
 perform pg_temp.check_that((select balance_amount=300000 from public.obligations where source_id=r2),'retur supplier mengurangi hutang');
 perform public.reverse_document(gen_random_uuid(),'operation',purchase_ret,'2026-10-31','Koreksi retur supplier');
 perform pg_temp.check_that((select balance_amount=400000 from public.obligations where source_id=r2),'koreksi retur supplier');
 data:=jsonb_build_object('date','2026-10-31','source',r2,'quantity','20','amount','400000','note','Retur seluruh sisa');perform public.save_operation(gen_random_uuid(),'purchase_return',data,true);
 perform pg_temp.check_that((select balance_amount=0 from public.obligations where source_id=r2),'retur pengganti memakai sisa aktual');
 perform pg_temp.expect_error(format('select public.reverse_document(%L,''payment'',%L,''2026-10-31'',''Koreksi'')',gen_random_uuid(),payment1),'Koreksi retur dana terlebih dahulu');
 -- Sopir dapat mencatat tugasnya; dua peristiwa ini tidak mengurangi stok lagi.
 data:=sale_data||jsonb_build_object('driver',driver,'assigned',collector,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','1','price','1')));
 perform public.save_operation(driver_sale,'sale',data,true);
 select id into item_id from public.operation_items where operation_id=driver_sale;
 select sum(quantity) into qty from public.stock_movements where product_id=live;
 perform set_config('request.jwt.claim.sub',driver::text,true);execute 'set local role authenticated';
 data:=jsonb_build_array(jsonb_build_object('item',item_id,'quantity','1'));
 perform public.record_delivery(delivery,driver_sale,'2026-10-31','sent',data,null);perform public.record_delivery(delivery,driver_sale,'2026-10-31','sent',data,null);
 perform public.record_delivery(gen_random_uuid(),driver_sale,'2026-10-31','received',data,'Diterima pelanggan');
 perform pg_temp.check_that((select count(*)=2 from public.delivery_events where sale_id=driver_sale),'pengiriman idempoten');
 execute 'reset role';perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_temp.check_that((select sum(quantity)=qty from public.stock_movements where product_id=live),'pengiriman tidak mengeluarkan stok lagi');
 -- Stok insufficient harus membatalkan SELURUH posting.
 data:=sale_data||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','99999','price','1')));
 perform pg_temp.expect_error(format('select public.save_operation(%L,''sale'',%L,true)',gen_random_uuid(),data),'Stok tidak mencukupi');
 -- 15–16. Ringkasan konsisten, laporan tidak menyatakan laba final.
 s:=public.business_summary('2026-10-31','2026-10-31');
 perform pg_temp.check_that(s->>'report_status'='Belum lengkap','laporan HPP belum disahkan');
 perform pg_temp.check_that((s->>'sales')::numeric=(select coalesce(sum(amount),0) from public.operations where kind='sale' and status='final' and operation_date='2026-10-31'),'dashboard konsisten dengan transaksi');
 -- Uji RLS dengan role database authenticated, bukan hanya pemanggilan service.
 perform set_config('request.jwt.claim.sub',collector::text,true);execute 'set local role authenticated';
 perform pg_temp.check_that((select count(*)=1 from public.operations where id=collect_sale),'penagih melihat tugas sendiri');
 perform pg_temp.check_that((select count(*)=1 from public.obligations where source_id=collect_sale),'penagih melihat tagihan sendiri');
 perform pg_temp.check_that((select count(*)=0 from public.operations where id=sale),'penagih tidak melihat penjualan lain');
 perform pg_temp.check_that((select count(*)=0 from public.cash_movements where account_id=acc),'penagih tidak melihat saldo kantor');
 perform pg_temp.check_that((select count(*)=0 from public.purchase_dos),'penagih tidak melihat pembelian');
 perform pg_temp.expect_error(format('insert into public.cash_movements(account_id,amount,movement_date,source_type,created_by) values(%L,1,''2026-10-31'',''finance'',%L)',bag,collector),'permission denied');
 perform pg_temp.expect_error(format('select public.post_payment(%L,''receivable'',%L,''2026-10-31'',%L,1,null)',gen_random_uuid(),sale,bag),'Tidak memiliki akses');
 perform pg_temp.expect_error('select public.business_summary(null,null)','Tidak memiliki akses');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',driver::text,true);execute 'set local role authenticated';
 perform pg_temp.expect_error(format('select public.record_delivery(%L,%L,''2026-10-31'',''sent'',''[]'',null)',gen_random_uuid(),sale),'Tidak memiliki akses');
 perform pg_temp.expect_error(format('select public.save_operation(%L,''finance'',''{}'',true)',gen_random_uuid()),'Tidak memiliki akses');execute 'reset role';
 perform set_config('request.jwt.claim.sub',production::text,true);execute 'set local role authenticated';
 perform pg_temp.check_that((select count(*)>0 from public.stock_movements where product_id=live),'produksi membaca stok');
 perform pg_temp.check_that((select count(*)=0 from public.payments),'produksi tidak melihat pembayaran');
 perform pg_temp.expect_error(format('select public.post_payment(%L,''payable'',%L,''2026-10-31'',%L,1,null)',gen_random_uuid(),r2,acc),'Tidak memiliki akses');execute 'reset role';
 perform set_config('request.jwt.claim.sub',inactive::text,true);execute 'set local role authenticated';
 perform pg_temp.check_that((select count(*)=0 from public.operations),'akun nonaktif ditolak');execute 'reset role';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);execute 'set local role authenticated';
 perform pg_temp.check_that((select count(*)=0 from public.operations),'akun tanpa profil ditolak');
 perform pg_temp.expect_error('select public.confirm_purchase_receipt_internal(null,null,null,null,null,null,null,null)','permission denied');execute 'reset role';
 -- Timbang lapangan terpisah dari harga dan finalisasi keuangan.
 perform set_config('request.jwt.claim.sub',production::text,true);execute 'set local role authenticated';
 perform pg_temp.check_that((select count(*)>0 from public.receiving_tasks() where id=do_id),'produksi melihat tugas timbang');
 perform pg_temp.check_that((select count(*)=0 from public.purchase_dos),'produksi tidak melihat harga DO');
 reversal:=gen_random_uuid();
 perform public.record_measurement(reversal,do_id,'2026-10-31',12,10,'Timbang petugas');
 perform public.record_measurement(reversal,do_id,'2026-10-31',12,10,'Timbang petugas');
 data:=jsonb_build_object('date','2026-10-31','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','1','direction','out'),jsonb_build_object('product',fillet,'unit','kg','quantity','0.8','direction','in')));perform public.save_operation(gen_random_uuid(),'production',data,true);
 perform pg_temp.expect_error(format('select public.confirm_measurement(%L,%L,10,null,null)',gen_random_uuid(),reversal),'Tidak memiliki akses');
 execute 'reset role';perform set_config('request.jwt.claim.sub',actor::text,true);new_ret:=gen_random_uuid();
 perform public.confirm_measurement(new_ret,reversal,10,null,null);perform public.confirm_measurement(new_ret,reversal,10,null,null);
 perform pg_temp.check_that((select actual_weight=10 and bill_amount=200000 from public.purchase_receipts where id=new_ret),'konfirmasi timbang stok aktual dan dasar tagihan');
 perform pg_temp.expect_error(format('select public.confirm_measurement(%L,%L,10,null,null)',gen_random_uuid(),reversal),'sudah dikonfirmasi');
 perform public.manage_purchase(do_id,'close','{"note":"Selesai"}');
 perform pg_temp.expect_error(format('select public.confirm_purchase_receipt(%L,%L,''2026-10-31'',null,1,1,null,null)',gen_random_uuid(),do_id),'DO sudah ditutup');
 -- Banyak item, diskon, pembayaran awal, dan retur seluruhnya.
 data:=jsonb_build_object('date','2026-10-31','partner',customer,'account',acc,'discount','30000','paid','20000','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','1','price','30000'),jsonb_build_object('product',fillet,'unit','kg','quantity','2','price','50000')));
 perform public.save_operation(multi,'sale',data,true);perform public.save_operation(multi,'sale',data,true);
 perform pg_temp.check_that((select total::numeric=100000 and paid::numeric=20000 and balance_amount=80000 from public.obligations where source_id=multi),'banyak item diskon dan pembayaran awal');
 select jsonb_build_object('date','2026-10-31','source',multi,'account',acc,'note','Retur penuh','items',jsonb_agg(jsonb_build_object('source_item',id,'quantity',quantity))) into data from public.operation_items where operation_id=multi;
 perform public.save_operation(full_ret,'sale_return',data,true);
 perform pg_temp.check_that((select amount=100000 and refund_amount=20000 from public.operations where id=full_ret),'retur penuh membalik diskon dan pembayaran awal');
 perform pg_temp.check_that((select balance_amount=0 from public.obligations where source_id=multi),'retur penuh tidak menyisakan tagihan');
 s:=public.business_summary('2026-10-31','2026-10-31');before_cash:=(s->>'asset_disposal_result')::numeric;
 data:=jsonb_build_object('date','2026-10-31','category','asset_sale','asset',asset,'book_value','600000','account',acc,'amount','800000','note','Jual freezer UAT');perform public.save_operation(disposal,'finance',data,true);
 s:=public.business_summary('2026-10-31','2026-10-31');perform pg_temp.check_that((s->>'asset_disposal_result')::numeric=before_cash+200000,'hasil penjualan aset bukan seluruh kas masuk');
 perform public.reverse_document(gen_random_uuid(),'operation',disposal,'2026-10-31','Koreksi penjualan aset');
 perform pg_temp.check_that((select disposed_by is null from public.fixed_assets where id=asset),'aset aktif kembali setelah pembalikan penjualan');
 s:=public.business_summary('2026-10-31','2026-10-31');perform pg_temp.check_that((s->>'asset_disposal_result')::numeric=before_cash,'pembalikan tidak menggandakan hasil aset');
 -- Satuan ekor berasal dari konversi yang benar-benar ditimbang, tanpa asumsi kg.
 data:=jsonb_build_object('date','2026-10-31','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','10','direction','out'),jsonb_build_object('product',live,'unit','ekor','quantity','5','weight','10','direction','in')));perform public.save_operation(gen_random_uuid(),'production',data,true);
 select sum(quantity) into qty from public.stock_movements where product_id=live and unit='kg';
 data:=jsonb_build_object('date','2026-10-31','partner',customer,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','ekor','quantity','2','price','10000')));perform public.save_operation(gen_random_uuid(),'sale',data,true);
 perform pg_temp.check_that((select sum(quantity)=3 from public.stock_movements where product_id=live and unit='ekor'),'penjualan menyimpan jumlah ekor');
 perform pg_temp.check_that((select sum(quantity)=qty from public.stock_movements where product_id=live and unit='kg'),'ekor tidak mengonversi kg diam-diam');
 data:=jsonb_build_object('date','2026-10-31','partner',customer,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','ekor','quantity','0.5','price','10000')));
 perform pg_temp.expect_error(format('select public.save_operation(%L,''sale'',%L,true)',gen_random_uuid(),data),'Produk, varian, satuan atau jumlah tidak valid');
 -- Borongan diterima parsial dengan batas total tagihan kesepakatan.
 perform public.create_purchase_do(lump_do,'2026-10-31',supplier,live,null,null,null,'borongan',1000000,null);
 perform public.confirm_purchase_receipt(lump_receipt,lump_do,'2026-10-31',null,100,null,600000,null);perform public.confirm_purchase_receipt(lump_receipt,lump_do,'2026-10-31',null,100,null,600000,null);
 perform public.confirm_purchase_receipt(gen_random_uuid(),lump_do,'2026-10-31',null,40,null,400000,null);
 perform pg_temp.expect_error(format('select public.confirm_purchase_receipt(%L,%L,''2026-10-31'',null,1,null,1,null)',gen_random_uuid(),lump_do),'Total tagihan borongan melebihi');
 -- Owner positif dan arah kategori yang salah ditolak.
 perform set_config('request.jwt.claim.sub',owner_actor::text,true);execute 'set local role authenticated';
 s:=public.business_summary(null,null);perform pg_temp.check_that(s->>'report_status'='Belum lengkap','owner dapat membaca laporan');
 perform pg_temp.check_that((select count(*)>0 from public.audit_events where table_name='operations' and record_id=sale::text and after_data->>'status'='final'),'posting final memiliki audit');
 perform pg_temp.expect_error('select public.save_finance_category(''custom_uat_invalid'',''UAT'',''out'',''income'',true)','Arah uang dan klasifikasi kategori tidak sesuai');
 execute 'reset role';
 raise notice 'UAT operasi: seluruh pemeriksaan lulus';
end $$;
rollback;
