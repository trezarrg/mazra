begin;
do $$ begin execute format('alter sequence %s restart with 9000000000000000000',pg_get_serial_sequence('public.operations','document_no')); end $$;
create function pg_temp.check_measurements(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Uji pengukuran gagal: %',label; end if; end $$;
create function pg_temp.reject_measurements(statement text,message text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then if position(message in sqlerrm)>0 then return; end if; raise exception 'Pesan berbeda: %',sqlerrm; end;
 raise exception 'Seharusnya ditolak: %',message;
end $$;
do $$
declare
 actor uuid; admin_id uuid:=gen_random_uuid(); worker_id uuid:=gen_random_uuid(); driver_id uuid:=gen_random_uuid(); partner uuid:=gen_random_uuid(); live uuid; carcass uuid; variant uuid; large uuid;
 purchase uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); loss uuid:=gen_random_uuid(); sale uuid:=gen_random_uuid(); cut uuid:=gen_random_uuid();
 correction uuid:=gen_random_uuid(); dest uuid; reference uuid; data jsonb; after_data jsonb; line uuid; count_before bigint; value_before numeric; delivery uuid:=gen_random_uuid(); queue_id uuid:=gen_random_uuid(); report jsonb; actor_role text;
 dt date:=(clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
 select id into actor from public.profiles where active and role in ('developer','owner') limit 1;
 perform pg_temp.check_measurements(actor is not null,'pemilik tersedia');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into auth.users(id,email,email_confirmed_at) values(admin_id,'measure-admin-'||admin_id||'@example.invalid',now()),(worker_id,'measure-worker-'||worker_id||'@example.invalid',now()),(driver_id,'measure-driver-'||driver_id||'@example.invalid',now());
 insert into public.profiles(id,full_name,role,active) values(admin_id,'Uji admin pengukuran','admin',true),(worker_id,'Uji produksi pengukuran','production',true),(driver_id,'Uji sopir pengukuran','driver',true);
 insert into public.partners(id,name,is_supplier,is_customer) values(partner,'Uji pengukuran',true,true);
 live:=public.save_product_measured(null,'Ayam hidup uji ukuran',array['kg','ekor'],true,'{"count_unit":"ekor","kg_per_count":"2","allow_estimates":true}');
 carcass:=public.save_product_measured(null,'Karkas uji ukuran',array['kg','ekor'],true,'{"count_unit":"ekor","kg_per_count":"1.4","allow_estimates":true,"shelf_life_days":"3"}');
 variant:=public.save_variant_measured(null,live,'Kecil',true,1.2);
 large:=public.save_variant_measured(null,live,'Besar',true,2.5);
 perform public.create_do_measured(purchase,dt,partner,live,null,100,50,'kg',30000,null,variant);
 perform public.confirm_receipt_measured(receipt,purchase,dt,null,100,100,null,null,'{"weight_source":"supplier","count":"50","count_source":"supplier","count_unit":"ekor"}');
 select stock_movement_id into reference from public.purchase_receipts where id=receipt;
 perform pg_temp.check_measurements((select count_balance::bigint=50 and count_status='known' and balance::numeric=100 from public.stock_measured_balances where product_id=live and variant_id=variant),'penerimaan 100 kg / 50 ekor');
 perform pg_temp.check_measurements((select total::numeric=3000000 from public.obligations where source_id=receipt),'tagihan supplier utuh');
 data:=jsonb_build_object('date',dt,'stock_event','loss','loss_reason','unloading_death','location','Bongkar','note','Tiga ayam mati',
 'items',jsonb_build_array(jsonb_build_object('product',live,'variant',variant,'unit','kg','direction','out','count','3','count_source','counted','weight_source','estimated','stock_reference',reference,'estimate_confirmed','true')));
 perform public.save_operation(loss,'adjustment',data,true);
 perform public.save_operation(loss,'adjustment',data,true);
 perform pg_temp.check_measurements((select balance::numeric=94 and count_balance::bigint=47 and weight_estimated from public.stock_measured_balances where product_id=live and variant_id=variant),'referensi penerimaan 2 kg mengalahkan rasio kecil 1.2 kg');
 perform pg_temp.check_measurements((select count(*)=1 from public.stock_movements where source_id=loss),'klik ulang kehilangan idempotent');
 perform public.rebuild_stock_valuation();
 perform pg_temp.check_measurements((select sum(s.stock_result)=-180000 from public.stock_valuation s join public.stock_movements m on m.id=s.movement_id where m.source_id=loss),'kerugian berdasarkan modal, bukan kas');
 perform pg_temp.check_measurements(not exists(select 1 from public.cash_movements where source_id=loss),'kehilangan bukan pembayaran');
 perform public.save_variant_measured(variant,live,'Kecil',true,1.3);
 perform public.save_operation(loss,'adjustment',data,true);
 perform pg_temp.check_measurements((select balance::numeric=94 from public.stock_measured_balances where product_id=live and variant_id=variant),'rasio baru tidak mengubah riwayat');
 after_data:=jsonb_set(jsonb_set(data,'{items,0,quantity}','"5.4"'),'{items,0,weight_source}','"measured"');
 dest:=public.change_transaction(correction,'operation',loss,'replace',dt,'Hasil timbang sebenarnya',after_data);
 perform pg_temp.check_measurements((select balance::numeric=94.6 and count_balance::bigint=47 from public.stock_measured_balances where product_id=live and variant_id=variant),'koreksi mengembalikan 0.6 kg, jumlah mati tetap tiga');
 data:=jsonb_build_object('date',dt,'items',jsonb_build_array(
 jsonb_build_object('product',live,'variant',variant,'unit','kg','direction','out','quantity','20','count','10'),
 jsonb_build_object('product',carcass,'unit','kg','direction','in','quantity','14','count','10')));
 perform public.save_operation(cut,'production',data,true);
 perform pg_temp.check_measurements((select balance::numeric=74.6 and count_balance::bigint=37 from public.stock_measured_balances where product_id=live and variant_id=variant),'bahan produksi bergerak dalam dua ukuran');
 perform pg_temp.check_measurements((select balance::numeric=14 and count_balance::bigint=10 from public.stock_measured_balances where product_id=carcass),'hasil memiliki rasio sendiri');
 report:=public.processing_summary(dt,dt);
 perform pg_temp.check_measurements(report->>'count_status'='known' and report->>'count_unit'='ekor','rekap menyertakan kualitas jumlah');
 data:=jsonb_build_object('date',dt,'partner',partner,'items',jsonb_build_array(jsonb_build_object('product',carcass,'unit','kg','quantity','2','price','40000','count_source','estimated','estimate_confirmed','true')));
 perform public.save_operation(sale,'sale',data,true);
 perform pg_temp.check_measurements((select amount=80000 from public.operations where id=sale),'harga dihitung sekali per kg');
 perform pg_temp.check_measurements((select count_status='estimated' and count_balance::bigint=9 from public.stock_measured_balances where product_id=carcass),'jumlah perkiraan tidak dianggap hitung nyata');
 select id into line from public.operation_items where operation_id=sale;
 -- Shipping tracks both measurements and does not post stock a second time.
 select count(*) into count_before from public.stock_movements where product_id=carcass;
 after_data:=jsonb_build_array(jsonb_build_object('item',line,'quantity','1','count','1','count_source','counted'));
 perform public.record_delivery_measured(delivery,sale,dt,'sent',after_data,null);
 perform public.record_delivery_measured(delivery,sale,dt,'sent',after_data,null);
 perform pg_temp.check_measurements((select count(*)=count_before from public.stock_movements where product_id=carcass),'pengiriman tidak mengurangi stok lagi');
 perform pg_temp.reject_measurements(format('select public.record_delivery_measured(%L,%L,%L,%L,%L,null)',gen_random_uuid(),sale,dt,'received',jsonb_build_array(jsonb_build_object('item',line,'quantity','2','count','1'))),'Berat pengiriman');
 perform public.cancel_delivery(delivery,'Uji catatan pengiriman salah');
 perform public.record_delivery_measured(gen_random_uuid(),sale,dt,'sent',jsonb_build_array(jsonb_build_object('item',line,'quantity','2','count','1')),null);
 perform public.save_operation(gen_random_uuid(),'sale_return',jsonb_build_object('date',dt,'source',sale,'note','Retur lengkap','items',jsonb_build_array(jsonb_build_object('source_item',line,'quantity','2','count','1'))),true);
 perform pg_temp.check_measurements((select balance::numeric=14 from public.stock_measured_balances where product_id=carcass),'retur kembali ke berat semula');
 perform pg_temp.reject_measurements(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'adjustment',jsonb_build_object('date',dt,'stock_event','loss','loss_reason','housing_death','location','Kandang','note','Uji','items',jsonb_build_array(jsonb_build_object('product',live,'variant',variant,'unit','kg','quantity','1','count','100','direction','out')))),'Jumlah ekor/pcs stok tidak cukup');
 perform pg_temp.reject_measurements(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'adjustment',jsonb_build_object('date',dt,'note','Uji','items',jsonb_build_array(jsonb_build_object('product',live,'variant',large,'unit','kg','quantity','1','count','1','direction','out','stock_reference',reference)))),'Referensi stok tidak sesuai');
 perform pg_temp.check_measurements(not has_function_privilege('authenticated','public.resolve_stock_measurement(jsonb,uuid,uuid,text,text)','execute'),'resolver internal tidak dapat dipanggil klien');
 perform pg_temp.check_measurements(not has_table_privilege('authenticated','public.stock_measurements','insert'),'gerakan jumlah tidak dapat ditulis langsung');
 -- Admin can record a loss, but the original owner-only adjustment boundary stays intact.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 execute 'set local role authenticated';
 data:=jsonb_build_object('date',dt,'note','Uji batas izin','items',jsonb_build_array(jsonb_build_object('product',live,'variant',variant,'unit','kg','direction','out','quantity','1','count','1')));
 perform pg_temp.reject_measurements(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'adjustment',data),'Penyesuaian stok memerlukan pemilik');
 perform public.save_operation(gen_random_uuid(),'adjustment',data||'{"stock_event":"loss","loss_reason":"housing_death","location":"Kandang"}',true);
 perform pg_temp.reject_measurements(format('select public.set_stock_count_baseline(%L,%L,null,1,%L,%L)',gen_random_uuid(),live,'counted','Uji'),'Penetapan jumlah memerlukan pemilik');
 perform set_config('request.jwt.claim.sub',worker_id::text,true);
 perform pg_temp.reject_measurements(format('select public.save_operation(%L,%L,%L,true)',gen_random_uuid(),'adjustment',data||'{"stock_event":"loss","loss_reason":"housing_death","location":"Kandang"}'),'Tidak memiliki akses');
 perform set_config('request.jwt.claim.sub',driver_id::text,true);
 perform pg_temp.reject_measurements('select public.receiving_queue_measured()','Tidak memiliki akses');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 -- A price-only correction must retain stock and payment compatibility after normalization.
 data:=jsonb_build_object('date',dt,'partner',partner,'items',jsonb_build_array(jsonb_build_object('product',carcass,'unit','kg','quantity','1','price','40000')));
 dest:=gen_random_uuid();perform public.save_operation(dest,'sale',data,true);
 select count(*) into count_before from public.stock_movements where source_id=dest;
 perform pg_temp.check_measurements(public.change_transaction(gen_random_uuid(),'operation',dest,'replace',dt,'Harga diperbaiki',jsonb_set(data,'{items,0,price}','"45000"'))=dest,'koreksi harga mempertahankan identitas');
 perform pg_temp.check_measurements((select count(*)=count_before from public.stock_movements where source_id=dest),'koreksi harga tidak mengganti stok');
 -- A count-only loss can be drafted, while finalization still needs a usable weight.
 data:=jsonb_build_object('date',dt,'note','Menunggu timbang','stock_event','loss','loss_reason','damaged','location','Freezer','items',jsonb_build_array(jsonb_build_object('product',carcass,'unit','kg','direction','out','count','1')));
 dest:=gen_random_uuid();perform public.save_operation(dest,'adjustment',data,false);
 perform pg_temp.check_measurements(not exists(select 1 from public.stock_movements where source_id=dest),'draft belum berdampak stok atau nilai');
 -- Queue confirmation carries count metadata and the DO variant into receipt stock.
 purchase:=gen_random_uuid();receipt:=gen_random_uuid();
 perform public.create_do_measured(purchase,dt,partner,live,null,10,5,'kg',30000,null,large);
 perform pg_temp.check_measurements(exists(select 1 from public.receiving_queue_measured() where id=purchase and variant_id=large),'antrean membawa ukuran tanpa nilai pembelian');
 perform public.record_queue_measured(queue_id,purchase,dt,null,10,null,'{"weight_source":"measured","count":"5","count_source":"counted","count_unit":"ekor"}');
 perform public.confirm_queue_measured(receipt,queue_id,10,null,null);
 perform pg_temp.check_measurements((select count_balance::bigint=5 and balance::numeric=10 from public.stock_measured_balances where product_id=live and variant_id=large),'konfirmasi timbang membawa dua ukuran');
 perform pg_temp.check_measurements(exists(select 1 from public.receiving_history_measured() where id=queue_id and measurement->>'count'='5'),'riwayat timbang membawa sumber angka');
 -- Original data without counts stays incomplete, and a dated physical baseline resolves it.
 purchase:=gen_random_uuid(); receipt:=gen_random_uuid();
 perform public.create_purchase_do(purchase,dt,partner,live,null,null,null,'kg',30000,null);
 perform public.confirm_purchase_receipt(receipt,purchase,dt,null,10,10,null,null);
 perform pg_temp.check_measurements((select count_status='incomplete' and count_balance is null from public.stock_measured_balances where product_id=live and variant_id is null),'data tanpa jumlah tetap belum lengkap');
 perform public.set_stock_count_baseline(gen_random_uuid(),live,null,5,'counted','Hitung fisik awal');
 perform pg_temp.check_measurements((select count_status='known' and count_balance::numeric=5 from public.stock_measured_balances where product_id=live and variant_id is null),'baseline tidak mengubah kg atau hutang');
end $$;
select 'Lulus: dua ukuran, varian, rasio referensi, kerugian, koreksi, produksi, penjualan, retur, baseline, idempotensi dan izin.' result;
rollback;
