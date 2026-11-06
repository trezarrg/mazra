-- All fixtures roll back. Transactional RESTART isolates the identity counter and
-- restores it on rollback; replica mode prevents audit counter consumption.
begin;
set local session_replication_role=replica;
do $$ begin execute format('alter sequence %s restart with 9000000000000000000',pg_get_serial_sequence('public.operations','document_no')); end $$;
create function pg_temp.check_processing(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Uji hasil potong gagal: %',label; end if; end $$;
create function pg_temp.reject_processing(statement text,message text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if position(message in sqlerrm)>0 then return; end if;
   raise exception 'Pesan berbeda: %',sqlerrm;
 end;
 raise exception 'Seharusnya ditolak: %',message;
end $$;
do $$
declare
 actor uuid; worker uuid:=gen_random_uuid(); other_driver uuid:=gen_random_uuid(); partner uuid:=gen_random_uuid();
 live uuid:=gen_random_uuid(); carcass uuid:=gen_random_uuid(); fillet uuid:=gen_random_uuid(); parts uuid:=gen_random_uuid(); bones uuid:=gen_random_uuid();
 order_id uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); sale uuid:=gen_random_uuid(); cut uuid:=gen_random_uuid(); next_cut uuid:=gen_random_uuid();
 count_sale uuid:=gen_random_uuid(); ret1 uuid:=gen_random_uuid(); ret2 uuid:=gen_random_uuid(); carcass_sale uuid:=gen_random_uuid();
 line_id uuid; account uuid:=gen_random_uuid(); data jsonb; sale_data jsonb; return_data jsonb; summary jsonb; prod uuid;
 dt date:='2099-11-05'; base_no bigint:=-700000000000000000-(random()*1000000)::bigint;
begin
 select id into actor from public.profiles where active and role in ('developer','owner','admin') limit 1;
 perform pg_temp.check_processing(actor is not null,'pengelola tersedia');
 insert into auth.users(id,email,email_confirmed_at) values(worker,'cut-'||worker||'@example.invalid',now()),(other_driver,'cut-'||other_driver||'@example.invalid',now());
 insert into public.profiles(id,full_name,role,active) values(worker,'Uji hasil potong','production',true),(other_driver,'Uji akses','driver',true);
 insert into public.partners(id,name,is_customer,is_supplier) values(partner,'Uji hasil potong',true,true);
 insert into public.cash_accounts(id,name,account_type) values(account,'Kas uji hasil potong','cash');
 insert into public.products(id,name) values(live,'Ayam hidup uji'),(carcass,'Karkas uji'),(fillet,'Fillet uji'),(parts,'Bagian uji'),(bones,'Tulang uji');
 foreach prod in array array[live,carcass,fillet,parts,bones] loop
   insert into public.product_units(product_id,unit) values(prod,'kg'),(prod,'ekor'),(prod,'pcs');
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.purchase_dos(id,document_no,purchase_date,supplier_id,product_id,price_method,price,created_by,status)
 overriding system value values(order_id,base_no,dt,partner,live,'kg',30000,actor,'open');
 perform public.confirm_purchase_receipt(receipt,order_id,dt,null,100,100,null,null);
 sale_data:=jsonb_build_object('date',dt,'partner',partner,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','20','price','30000')));
 perform public.save_operation(sale,'sale',sale_data,true);
 data:=jsonb_build_object('date',dt,'items',jsonb_build_array(
   jsonb_build_object('product',live,'unit','kg','direction','out','quantity','50','count','25'),
   jsonb_build_object('product',carcass,'unit','kg','direction','in','quantity','30','count','15'),
   jsonb_build_object('product',fillet,'unit','kg','direction','in','quantity','5'),
   jsonb_build_object('product',parts,'unit','kg','direction','in','quantity','5')));
 perform set_config('request.jwt.claim.sub',worker::text,true);
 execute 'set local role authenticated';
 perform public.save_operation(cut,'production',data,false);
 perform pg_temp.check_processing((select balance::numeric=80 from public.stock_balances where product_id=live),'draft belum mengurangi stok');
 perform public.save_operation(cut,'production',data,true);
 perform public.save_operation(cut,'production',data,true);
 perform pg_temp.check_processing((select balance::numeric=30 from public.stock_balances where product_id=live),'100 diterima - 20 dijual - 50 dipotong = 30');
 perform pg_temp.check_processing((select count(*)=4 from public.stock_movements where source_id=cut),'klik ulang tidak menggandakan hasil');
 summary:=public.processing_summary(dt,dt);
 perform pg_temp.check_processing((summary->>'input_weight')::numeric=50 and (summary->>'output_weight')::numeric=40 and (summary->>'piece_count')::numeric=25,'laporan berat dan ekor');
 perform pg_temp.check_processing(not(summary ? 'purchases') and not(summary ? 'sales'),'produksi tidak melihat nilai uang');
 perform pg_temp.check_processing(jsonb_array_length(public.processing_options())>=5,'pilihan bahan dan hasil tersedia');
 perform pg_temp.reject_processing(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'production',jsonb_set(data,'{items,1,quantity}','"60"')),'Total berat hasil');
 perform pg_temp.reject_processing(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'production',data),'tidak cukup');
 perform pg_temp.reject_processing(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'production',jsonb_set(data,'{items,0,count}','"1.5"')),'bilangan bulat positif');
 perform pg_temp.check_processing((select balance::numeric=30 from public.stock_balances where product_id=live),'permintaan gagal atomik');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 sale_data:=jsonb_build_object('date',dt,'partner',partner,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','ekor','quantity','10','weight','20','price','40000')));
 perform public.save_operation(count_sale,'sale',sale_data,true);
 perform pg_temp.check_processing((select amount=400000 from public.operations where id=count_sale),'harga tetap per ekor');
 perform pg_temp.check_processing((select balance::numeric=10 from public.stock_balances where product_id=live),'penjualan 10 ekor mengurangi 20 kg');
 perform pg_temp.check_processing(not exists(select 1 from public.stock_movements where source_id=count_sale and unit<>'kg'),'tidak membuat stok ekor terpisah');
 perform pg_temp.reject_processing(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'sale',sale_data#-'{items,0,weight}'),'Isi berat aktual');
 select id into line_id from public.operation_items where operation_id=count_sale;
 return_data:=jsonb_build_object('date',dt,'source',count_sale,'note','Uji retur','items',jsonb_build_array(jsonb_build_object('source_item',line_id,'quantity','2','weight','4')));
 perform public.save_operation(ret1,'sale_return',return_data,true);
 perform pg_temp.check_processing((select balance::numeric=14 from public.stock_balances where product_id=live),'retur 2 ekor menambah 4 kg');
 perform pg_temp.reject_processing(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'sale_return',jsonb_set(return_data,'{items,0,weight}','"21"')),'Berat retur melebihi');
 return_data:=jsonb_set(jsonb_set(return_data,'{items,0,quantity}','"8"'),'{items,0,weight}','"16"');
 perform public.save_operation(ret2,'sale_return',return_data,true);
 perform pg_temp.check_processing((select balance::numeric=30 from public.stock_balances where product_id=live),'retur lengkap mengembalikan berat asal');
 perform public.reverse_document(gen_random_uuid(),'operation',ret1,dt,'Uji pembatalan retur');
 perform pg_temp.check_processing((select balance::numeric=26 from public.stock_balances where product_id=live),'koreksi retur membalik 4 kg');
 data:=jsonb_build_object('date',dt,'items',jsonb_build_array(
   jsonb_build_object('product',carcass,'unit','kg','direction','out','quantity','20'),
   jsonb_build_object('product',fillet,'unit','kg','direction','in','quantity','14'),
   jsonb_build_object('product',bones,'unit','kg','direction','in','quantity','4')));
 perform public.save_operation(next_cut,'production',data,true);
 perform pg_temp.check_processing((select balance::numeric=19 from public.stock_balances where product_id=fillet),'karkas dapat diolah lagi menjadi fillet');
 perform pg_temp.reject_processing(format('select public.reverse_document(%L,%L,%L,%L,%L)',gen_random_uuid(),'operation',cut,dt,'Koreksi induk'),'tidak cukup');
 perform public.reverse_document(gen_random_uuid(),'operation',next_cut,dt,'Koreksi proses lanjutan');
 perform pg_temp.check_processing((select balance::numeric=30 from public.stock_balances where product_id=carcass),'koreksi proses mengembalikan bahan');
 sale_data:=jsonb_build_object('date',dt,'partner',partner,'items',jsonb_build_array(jsonb_build_object('product',carcass,'unit','kg','quantity','10','price','40000')));
 perform public.save_operation(carcass_sale,'sale',sale_data,true);
 select id into line_id from public.operation_items where operation_id=carcass_sale;
 perform public.save_operation(gen_random_uuid(),'sale_return',jsonb_build_object('date',dt,'source',carcass_sale,'note','Uji retur karkas','items',jsonb_build_array(jsonb_build_object('source_item',line_id,'quantity','10'))),true);
 perform public.reverse_document(gen_random_uuid(),'operation',cut,dt,'Koreksi hasil potong');
 perform pg_temp.check_processing((select balance::numeric=76 from public.stock_balances where product_id=live),'koreksi hasil potong mengembalikan 50 kg');
 summary:=public.processing_summary(dt,dt);
 perform pg_temp.check_processing((summary->>'process_count')::integer=0 and (summary->>'purchases')::numeric=3000000,'laporan mengabaikan proses dibalik dan memuat rekap uang');
 perform set_config('request.jwt.claim.sub',other_driver::text,true);
 execute 'set local role authenticated';
 perform pg_temp.reject_processing('select public.processing_options()','Tidak memiliki akses');
 perform pg_temp.reject_processing(format('select public.processing_summary(%L,%L)',dt,dt),'Tidak memiliki akses');
 execute 'reset role';
 perform pg_temp.check_processing(not has_function_privilege('anon','public.processing_options()','execute'),'anon tidak dapat membaca pilihan stok');
 perform pg_temp.check_processing(not has_function_privilege('authenticated','public.save_operation_internal(uuid,text,jsonb,boolean)','execute'),'fungsi internal tetap privat');
end $$;
select 'Lulus: penerimaan, draft, potong, klik ulang, kg/ekor, retur, koreksi, proses lanjutan, laporan, dan otorisasi.' as result;
rollback;
