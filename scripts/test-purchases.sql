-- Jalankan setelah definisi migrasi dalam transaksi yang selalu di-rollback.
do $$
declare actor uuid; supplier uuid := gen_random_uuid(); product uuid := gen_random_uuid(); order_id uuid := gen_random_uuid(); receipt1 uuid := gen_random_uuid(); receipt2 uuid := gen_random_uuid(); n numeric; count_rows integer;
begin
 select id into actor from public.profiles where active and role in ('developer','owner','admin') limit 1;
 if actor is null then raise exception 'Tidak ada profil untuk pengujian'; end if;
 insert into public.partners(id,name,is_supplier) values(supplier,'TEST transaksi pembelian',true);
 insert into public.products(id,name) values(product,'TEST transaksi pembelian');
 insert into public.product_units(product_id,unit) values(product,'kg');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.create_purchase_do(order_id,current_date,supplier,product,null,1000,null,'kg',20000,null);
 if exists(select 1 from public.stock_movements where product_id=product) or exists(select 1 from public.purchase_receipts where do_id=order_id) then raise exception 'DO mengubah stok atau hutang'; end if;
 perform public.confirm_purchase_receipt(receipt1,order_id,current_date,1000,980,1000,null,null);
 perform public.confirm_purchase_receipt(receipt1,order_id,current_date,1000,980,1000,null,null);
 perform public.confirm_purchase_receipt(receipt2,order_id,current_date,null,20,20,null,null);
 select sum(quantity),count(*) into n,count_rows from public.stock_movements where product_id=product;
 if n<>1000 or count_rows<>2 then raise exception 'Stok atau idempotensi salah'; end if;
 select sum(bill_amount),count(*) into n,count_rows from public.purchase_receipts where do_id=order_id;
 if n<>20400000 or count_rows<>2 then raise exception 'Tagihan atau idempotensi salah'; end if;
 begin
   perform public.confirm_purchase_receipt(gen_random_uuid(),order_id,current_date,null,5,0,null,null);
   raise exception 'Dasar tagihan tidak valid diterima';
 exception when others then if sqlerrm='Dasar tagihan tidak valid diterima' then raise; end if; end;
 if (select count(*) from public.stock_movements where product_id=product)<>2 then raise exception 'Penerimaan gagal mengubah stok'; end if;
 begin
   perform public.confirm_purchase_receipt(receipt1,order_id,current_date,1000,981,1000,null,null);
   raise exception 'Duplikasi berbeda diterima';
 exception when others then if sqlerrm='Duplikasi berbeda diterima' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
   perform public.confirm_purchase_receipt(gen_random_uuid(),order_id,current_date,null,1,1,null,null);
   raise exception 'Akses tidak berwenang diterima';
 exception when others then if sqlerrm='Akses tidak berwenang diterima' then raise; end if; end;
 execute 'set local role authenticated';
 select count(*) into count_rows from public.purchase_dos where id=order_id;
 if count_rows<>0 then raise exception 'RLS membocorkan DO'; end if;
 execute 'reset role';
end $$;
