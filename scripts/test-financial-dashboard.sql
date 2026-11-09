-- Rolled-back fixtures; transactional identity restarts preserve document counters.
begin;
set local session_replication_role=replica;
alter table public.stock_movements enable always trigger stock_valuation_lock;
alter table public.stock_movements enable always trigger stock_valuation_flush;
do $$ declare t text; begin foreach t in array array['operations','purchase_dos','stock_movements'] loop
 execute format('alter sequence %s restart with 8000000000000000000',pg_get_serial_sequence('public.'||t,case when t='stock_movements' then 'posting_order' else 'document_no' end));
end loop; end $$;
create function pg_temp.check_finance(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Uji keuangan gagal: %',label; end if; end $$;
create function pg_temp.reject_finance(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'Seharusnya ditolak: %',expected; end $$;
do $$
declare
 actor uuid; worker uuid:=gen_random_uuid(); partner uuid:=gen_random_uuid(); acc uuid:=gen_random_uuid();
 live uuid:=gen_random_uuid(); carcass uuid:=gen_random_uuid(); fillet uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); unknown_product uuid:=gen_random_uuid();
 order1 uuid:=gen_random_uuid(); order2 uuid:=gen_random_uuid(); receipt1 uuid:=gen_random_uuid(); receipt2 uuid:=gen_random_uuid();
 sale1 uuid:=gen_random_uuid(); sale2 uuid:=gen_random_uuid(); sale3 uuid:=gen_random_uuid(); process1 uuid:=gen_random_uuid(); process2 uuid:=gen_random_uuid();
 ret uuid:=gen_random_uuid(); ret_purchase uuid:=gen_random_uuid(); reversal uuid:=gen_random_uuid(); line_id uuid; opening_id uuid:=gen_random_uuid(); unknown_sale uuid:=gen_random_uuid();
 dt date:='2099-11-05'; data jsonb; s jsonb; before_s jsonb; reminders jsonb; initial_reminders jsonb; snapshot jsonb;
 event_id uuid; employee uuid:=gen_random_uuid(); index integer; pay uuid:=gen_random_uuid();
begin
 select id into actor from public.profiles where active and role in ('developer','owner') limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select jsonb_build_object('stock',sum(quantity),'cash',(select sum(amount) from public.cash_movements),'purchases',(select sum(bill_amount) from public.purchase_receipts)) into snapshot from public.stock_movements;
 initial_reminders:=public.dashboard_reminders_on(dt);
 insert into public.partners(id,name,is_customer,is_supplier) values(partner,'Uji dashboard',true,true);
 insert into public.products(id,name) values(live,'Uji modal hidup'),(carcass,'Uji modal karkas'),(fillet,'Uji modal fillet'),(other,'Uji modal bagian'),(unknown_product,'Uji modal awal');
 insert into public.product_units(product_id,unit) select p,'kg' from unnest(array[live,carcass,fillet,other,unknown_product]) p;
 insert into public.product_units(product_id,unit) values(live,'ekor');
 insert into public.cash_accounts(id,name,account_type) values(acc,'Kas uji dashboard','cash');
 perform public.create_purchase_do(order1,dt,partner,live,null,100,null,'kg',30000,null);
 perform public.create_purchase_do(order2,dt,partner,live,null,100,null,'kg',50000,null);
 perform public.confirm_purchase_receipt(receipt1,order1,dt,null,100,100,null,null);
 perform public.confirm_purchase_receipt(receipt2,order2,dt,null,100,100,null,null);
 perform public.set_bill_due('payable',receipt1,dt);perform public.set_bill_due('payable',receipt2,dt+1);
 perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((select quantity=200 and value=8000000 from public.stock_valuation_balances where product_id=live),'rata-rata dua pembelian Rp40.000/kg');
 data:=jsonb_build_object('date',dt,'partner',partner,'paid','0','due',dt,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','20','price','100000')));
 perform public.save_operation(sale1,'sale',data,false);
 perform pg_temp.check_finance(not exists(select 1 from public.stock_movements where source_id=sale1),'draft tanpa stok/HPP');
 perform public.save_operation(sale1,'sale',data,true);perform public.save_operation(sale1,'sale',data,true);
 data:=jsonb_build_object('date',dt,'items',jsonb_build_array(
  jsonb_build_object('product',live,'unit','kg','quantity','50','direction','out'),
  jsonb_build_object('product',carcass,'unit','kg','quantity','30','direction','in'),
  jsonb_build_object('product',fillet,'unit','kg','quantity','5','direction','in'),
  jsonb_build_object('product',other,'unit','kg','quantity','5','direction','in')));
 perform public.save_operation(process1,'production',data,true);
 perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((select value=1500000 and quantity=30 from public.stock_valuation_balances where product_id=carcass),'susut terserap: karkas Rp50.000/kg');
 perform pg_temp.check_finance((select sum(value)=0 from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.source_id=process1),'nilai modal konservatif antarhasil');
 data:=jsonb_build_object('date',dt,'items',jsonb_build_array(jsonb_build_object('product',carcass,'unit','kg','quantity','10','direction','out'),jsonb_build_object('product',fillet,'unit','kg','quantity','8','direction','in')));
 perform public.save_operation(process2,'production',data,true);perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((select quantity=13 and value=750000 from public.stock_valuation_balances where product_id=fillet),'olah lanjutan rata-rata stok hasil');
 data:=jsonb_build_object('date',dt,'partner',partner,'paid','0','due',dt+1,'items',jsonb_build_array(jsonb_build_object('product',live,'unit','ekor','quantity','2','weight','4','price','100000')));
 perform public.save_operation(sale2,'sale',data,true);
 data:=jsonb_build_object('date',dt,'partner',partner,'paid','0','due',dt-1,'items',jsonb_build_array(jsonb_build_object('product',fillet,'unit','kg','quantity','5','price','100000')));
 perform public.save_operation(sale3,'sale',data,true);perform public.rebuild_stock_valuation();
 s:=public.business_summary(dt,dt);
 perform pg_temp.check_finance((s->>'net_sales')::numeric=2700000 and (s->>'cogs')::numeric=1248461.54,'omzet dan HPP kg aktual penjualan ekor');
 perform pg_temp.check_finance((s->>'gross_profit')::numeric=1451538.46 and (s->>'business_profit')::numeric=1451538.46,'pembelian tidak dibebankan dua kali');
 select id into line_id from public.operation_items where operation_id=sale3;
 data:=jsonb_build_object('date',dt,'source',sale3,'note','Retur satu kg','items',jsonb_build_array(jsonb_build_object('source_item',line_id,'quantity','1')));
 perform public.save_operation(ret,'sale_return',data,true);perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((select round(sum(value),2)=57692.31 from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.source_id=ret),'retur memakai modal penjualan asal');
 perform public.reverse_document(reversal,'operation',ret,dt,'Koreksi retur');perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((public.business_summary(dt,dt)->>'cogs')::numeric=1248461.54,'koreksi membalik HPP retur asal');
 data:=jsonb_build_object('date',dt,'source',receipt1,'quantity','10','amount','500000','note','Retur supplier');
 perform public.save_operation(ret_purchase,'purchase_return',data,true);perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((public.business_summary(dt,dt)->>'stock_result')::numeric=100000,'selisih kredit retur dengan modal stok');
 perform public.reverse_document(gen_random_uuid(),'operation',ret_purchase,dt,'Koreksi retur supplier');
 event_id:=gen_random_uuid();
 data:=jsonb_build_object('date',dt,'note','Stok ditemukan','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','10','direction','in')));
 perform public.save_operation(event_id,'adjustment',data,true);
 data:=jsonb_build_object('date',dt,'note','Stok rusak','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','5','direction','out')));
 perform public.save_operation(gen_random_uuid(),'adjustment',data,true);perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((public.business_summary(dt,dt)->>'stock_result')::numeric=200000,'keuntungan dan kerugian penyesuaian stok');
 -- Backdated purchase changes later sales/processing, without changing document amounts.
 event_id:=gen_random_uuid();
 perform public.create_purchase_do(event_id,dt-1,partner,live,null,100,null,'kg',10000,null);
 perform public.confirm_purchase_receipt(gen_random_uuid(),event_id,dt-1,null,100,100,null,null);perform public.rebuild_stock_valuation();
 perform pg_temp.check_finance((select round(value/quantity,2)=30000 from public.stock_valuation_balances where product_id=live),'tanggal mundur menghitung ulang modal berikutnya');
 perform pg_temp.check_finance((select amount=2000000 from public.operations where id=sale1),'rekonstruksi tidak mengubah invoice');
 -- Finance categories: operating income/expense count, financing/equity/assets do not.
 before_s:=public.business_summary(dt,dt);
 perform public.save_operation(gen_random_uuid(),'finance',jsonb_build_object('date',dt,'note','Uji keuangan','account',acc,'category','capital','amount','10000000'),true);
 perform public.save_operation(gen_random_uuid(),'finance',jsonb_build_object('date',dt,'note','Uji keuangan','account',acc,'category','operating_income','amount','100000'),true);
 perform public.save_operation(gen_random_uuid(),'finance',jsonb_build_object('date',dt,'note','Uji keuangan','account',acc,'category','other_expense','amount','200000'),true);
 perform public.save_operation(gen_random_uuid(),'finance',jsonb_build_object('date',dt,'note','Uji keuangan','account',acc,'category','owner_draw','amount','300000'),true);
 perform public.save_operation(gen_random_uuid(),'finance',jsonb_build_object('date',dt,'note','Uji keuangan','account',acc,'category','fixed_asset','amount','400000','asset_name','Alat uji'),true);
 perform public.save_employee(employee,'{"name":"Pekerja uji profit","type":"daily","rate":"100000","active":true}');
 perform public.post_hr(gen_random_uuid(),'advance',jsonb_build_object('date',dt,'employee',employee,'account',acc,'amount','400000'));
 perform public.post_hr(gen_random_uuid(),'payroll',jsonb_build_object('date',dt,'employee',employee,'account',acc,'period_start',dt,'period_end',dt,'base','1000000','deduction','100000','advance_deduction','300000'));
 s:=public.business_summary(dt,dt);
 perform pg_temp.check_finance((s->>'wages')::numeric=900000 and (s->>'business_profit')::numeric=(before_s->>'business_profit')::numeric-1000000,'biaya dan gaji sekali; modal/prive/aset/kasbon bukan biaya usaha');
 -- Unknown opening value must never become a free cost of goods.
 insert into public.stock_movements(id,product_id,unit,quantity,movement_date,source_type,created_by) values(opening_id,unknown_product,'kg',10,dt,'opening',actor);
 data:=jsonb_build_object('date',dt,'partner',partner,'paid','0','items',jsonb_build_array(jsonb_build_object('product',unknown_product,'unit','kg','quantity','2','price','20000')));
 perform public.save_operation(unknown_sale,'sale',data,true);perform public.rebuild_stock_valuation();
 s:=public.business_summary(dt,dt);
 perform pg_temp.check_finance(s->>'cogs' is null and not(s->>'profit_complete')::boolean,'modal hilang menandai laba belum lengkap');
 perform public.save_stock_cost(opening_id,100000,'Bukti modal awal');
 s:=public.business_summary(dt,dt);
 perform pg_temp.check_finance((s->>'profit_complete')::boolean and (select value=80000 from public.stock_valuation_balances where product_id=unknown_product),'pengisian modal menghitung ulang HPP');
 perform pg_temp.reject_finance(format('select public.save_stock_cost(%L,-1,%L)',opening_id,'Uji'),'tidak valid');
 -- Partial/full payment changes receivables and cash, never profit or inventory.
 before_s:=public.business_summary(dt,dt);
 perform public.post_payment(pay,'receivable',sale1,dt,acc,1000000,'Cicilan');
 perform public.post_payment(pay,'receivable',sale1,dt,acc,1000000,'Cicilan');
 reminders:=public.dashboard_reminders_on(dt);
 perform pg_temp.check_finance((reminders#>>'{receivable,today,total}')::numeric=1000000+(initial_reminders#>>'{receivable,today,total}')::numeric,'sisa cicilan untuk hari ini');
 perform public.post_payment(gen_random_uuid(),'receivable',sale1,dt,acc,1000000,'Lunas');
 perform pg_temp.check_finance((public.business_summary(dt,dt)->>'business_profit')::numeric=(before_s->>'business_profit')::numeric,'pelunasan tidak memengaruhi profit');
 -- More than five reminders: totals use all invoices, list stays capped and sorted.
 for index in 1..7 loop
  insert into public.operations(id,kind,operation_date,status,partner_id,due_date,amount,payload,created_by,finalized_by)
  values(gen_random_uuid(),'sale',dt,'final',partner,dt,100,'{}',actor,actor);
 end loop;
 reminders:=public.dashboard_reminders_on(dt);
 perform pg_temp.check_finance((reminders#>>'{receivable,today,count}')::integer=7+(initial_reminders#>>'{receivable,today,count}')::integer and jsonb_array_length(reminders#>'{receivable,today,items}')=5,'batas lima dan hitung semua invoice');
 perform pg_temp.check_finance((reminders#>>'{receivable,today,total}')::numeric=700+(initial_reminders#>>'{receivable,today,total}')::numeric,'total tidak terpotong lima baris');
 perform pg_temp.check_finance((reminders#>>'{receivable,tomorrow,total}')::numeric=200000+(initial_reminders#>>'{receivable,tomorrow,total}')::numeric,'besok terpisah dari hari ini');
 perform pg_temp.check_finance((reminders#>>'{payable,today,total}')::numeric=3000000+(initial_reminders#>>'{payable,today,total}')::numeric,'hutang supplier hari ini');
 perform public.set_bill_due('receivable',sale2,dt);perform public.set_bill_due('receivable',sale2,dt);
 perform pg_temp.check_finance((public.dashboard_reminders_on(dt)#>>'{receivable,tomorrow,count}')::integer=(initial_reminders#>>'{receivable,tomorrow,count}')::integer,'ubah tempo memindahkan kelompok');
 perform public.set_bill_due('receivable',sale2,null);
 perform pg_temp.check_finance(exists(select 1 from jsonb_array_elements(public.dashboard_reminders_on(dt)#>'{receivable,unscheduled,items}') t where t->>'source_id'=sale2::text),'tanpa tempo tetap tersedia');
 perform pg_temp.reject_finance(format('select public.set_bill_due(%L,%L,%L)','receivable',sale1,dt),'lunas');
 -- Calendar boundary derives from calendar dates, not 24 hours on the client.
 perform public.set_bill_due('receivable',sale2,'2099-12-01');
 perform pg_temp.check_finance(exists(select 1 from jsonb_array_elements(public.dashboard_reminders_on('2099-11-30')#>'{receivable,tomorrow,items}') t where t->>'source_id'=sale2::text),'besok lintas bulan');
 perform public.set_bill_due('receivable',sale2,'2100-01-01');
 perform pg_temp.check_finance(exists(select 1 from jsonb_array_elements(public.dashboard_reminders_on('2099-12-31')#>'{receivable,tomorrow,items}') t where t->>'source_id'=sale2::text),'besok lintas tahun');
 -- RLS and direct RPCs protect cost data from production staff.
 insert into auth.users(id,email,email_confirmed_at) values(worker,'cost-worker-'||worker||'@example.invalid',now());
 insert into public.profiles(id,full_name,role) values(worker,'Uji produksi modal','production');
 perform set_config('request.jwt.claim.sub',worker::text,true);
 execute 'set local role authenticated';
 perform pg_temp.check_finance(not exists(select 1 from public.stock_valuation) and not exists(select 1 from public.stock_valuation_balances) and not exists(select 1 from public.stock_cost_review),'produksi tidak membaca harga modal');
 perform pg_temp.reject_finance('select public.dashboard_reminders()','Tidak memiliki akses');
 perform pg_temp.reject_finance(format('select public.business_summary(%L,%L)',dt,dt),'Tidak memiliki akses');
 perform pg_temp.reject_finance(format('select public.save_stock_cost(%L,1,%L)',opening_id,'Uji'),'memerlukan pemilik');
 perform pg_temp.reject_finance(format('select public.set_bill_due(%L,%L,%L)','receivable',sale2,dt),'Tidak memiliki akses');
 execute 'reset role';
 update public.profiles set role='driver' where id=worker;
 execute 'set local role authenticated';
 perform pg_temp.check_finance(not exists(select 1 from public.stock_valuation) and not exists(select 1 from public.stock_cost_review),'sopir tidak membaca harga modal');
 perform pg_temp.reject_finance('select public.dashboard_reminders()','Tidak memiliki akses');
 perform pg_temp.reject_finance(format('select public.business_summary(%L,%L)',dt,dt),'Tidak memiliki akses');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_temp.check_finance((select sum(quantity) from public.stock_movements where product_id not in(live,carcass,fillet,other,unknown_product))=(snapshot->>'stock')::numeric,'stok asli tidak berubah');
 -- Flush deferred trigger exactly as PostgreSQL does before committing an RPC.
 event_id:=gen_random_uuid();
 data:=jsonb_build_object('date',dt,'partner',partner,'paid','0','items',jsonb_build_array(jsonb_build_object('product',live,'unit','kg','quantity','0.001','price','100000')));
 perform public.save_operation(event_id,'sale',data,true);
 perform pg_temp.check_finance(not exists(select 1 from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.source_id=event_id),'valuasi menunggu seluruh posting');
 execute 'set constraints stock_valuation_flush immediate';
 execute 'set constraints stock_valuation_flush deferred';
 perform pg_temp.check_finance((select sum(cogs)=30 from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.source_id=event_id),'trigger commit atomik menghitung HPP tanpa pemanggilan manual');
 perform pg_temp.check_finance(public.dashboard_reminders()->>'today'=((now() at time zone 'Asia/Jakarta')::date)::text,'RPC publik mengikuti tanggal Jakarta');
 -- Public corrections reject a process whose output is already used. Separately
 -- exercise the private valuation engine to keep coverage of mixed-pool variance.
 before_s:=public.business_summary(dt,dt);
 event_id:=gen_random_uuid();
 perform pg_temp.reject_finance(format('select public.reverse_document(%L,%L,%L,%L,%L)',event_id,'operation',process2,dt,'Koreksi olah lanjutan'),'sudah dipakai');
 perform public.reverse_document_legacy(event_id,'operation',process2,dt,'Uji internal selisih modal');
 execute 'set constraints stock_valuation_flush immediate';
 execute 'set constraints stock_valuation_flush deferred';
 perform pg_temp.check_finance((select sum(value)=0 from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.source_id=event_id),'koreksi tetap membalik modal proses asal');
 perform pg_temp.check_finance((select abs(sum(revaluation)-28846.15384615)<0.01 from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.source_id=event_id),'selisih modal stok gabungan saat koreksi');
 perform pg_temp.check_finance(not exists(
  select 1 from public.stock_valuation_balances b join lateral(select sum(v.value+v.revaluation) value from public.stock_movements m join public.stock_valuation v on v.movement_id=m.id where m.product_id=b.product_id and m.variant_id is not distinct from b.variant_id and m.unit=b.unit) x on true
  where b.value is not null and abs(b.value-x.value)>0.01
 ),'saldo nilai stok sama dengan ledger termasuk selisih koreksi');
end $$;
rollback;
