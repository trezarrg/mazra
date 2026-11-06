begin;

-- Petugas timbang melihat identitas pengiriman, tanpa harga atau tagihan supplier.
create or replace function public.receiving_queue()
returns table(id uuid,document_no bigint,purchase_date date,supplier_name text,product_name text,origin text,estimated_weight text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 return query
 select d.id,d.document_no,d.purchase_date,s.name,p.name,d.origin,d.estimated_weight::text
 from public.purchase_dos d join public.partners s on s.id=d.supplier_id join public.products p on p.id=d.product_id
 where d.status='open'
   and not exists(select 1 from public.purchase_receipts r where r.do_id=d.id)
   and not exists(select 1 from public.receipt_measurements m where m.do_id=d.id and m.status in ('pending','accepted'))
 order by d.purchase_date desc,d.document_no desc;
end $$;
revoke all on function public.receiving_queue() from public,anon;
grant execute on function public.receiving_queue() to authenticated;

-- Riwayat membedakan hasil timbang dan penerimaan langsung tanpa menampilkan nilai pembelian.
create or replace function public.receiving_history()
returns table(id uuid,do_id uuid,document_no bigint,supplier_name text,product_name text,measurement_date date,origin_weight text,actual_weight text,note text,status text,created_by uuid,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 return query
 select m.id,m.do_id,d.document_no,s.name,p.name,m.measurement_date,m.origin_weight::text,m.actual_weight::text,m.note,m.status,m.created_by,m.created_at
 from public.receipt_measurements m join public.purchase_dos d on d.id=m.do_id join public.partners s on s.id=d.supplier_id join public.products p on p.id=d.product_id
 union all
 select r.id,r.do_id,d.document_no,s.name,p.name,r.receipt_date,r.origin_weight::text,r.actual_weight::text,null::text,'received'::text,r.created_by,r.created_at
 from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id join public.partners s on s.id=d.supplier_id join public.products p on p.id=d.product_id
 where not exists(select 1 from public.receipt_measurements m where m.receipt_id=r.id);
end $$;
revoke all on function public.receiving_history() from public,anon;
grant execute on function public.receiving_history() to authenticated;

create or replace function public.record_measurement(p_id uuid,p_do uuid,p_date date,p_origin numeric,p_actual numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.receipt_measurements%rowtype;
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_id is null or p_date is null or p_actual is null or p_actual::text in ('NaN','Infinity','-Infinity') or p_actual<=0 or p_actual>999999999999999.999 or p_actual<>round(p_actual,3) or (p_origin is not null and (p_origin<=0 or p_origin>999999999999999.999 or p_origin<>round(p_origin,3))) or length(coalesce(p_note,''))>1000 then raise exception 'Hasil timbang tidak valid'; end if;
 select * into r from public.receipt_measurements where id=p_id;
 if found then
  if r.created_by=auth.uid() and r.do_id=p_do and r.measurement_date=p_date and r.origin_weight is not distinct from p_origin and r.actual_weight=p_actual and r.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
  raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if not exists(select 1 from public.purchase_dos where id=p_do and status='open') then raise exception 'DO tidak tersedia atau sudah ditutup'; end if;
 if exists(select 1 from public.receipt_measurements where do_id=p_do and status='pending') then raise exception 'DO sudah memiliki hasil timbang yang menunggu konfirmasi'; end if;
 insert into public.receipt_measurements(id,do_id,measurement_date,origin_weight,actual_weight,note,created_by) values(p_id,p_do,p_date,p_origin,p_actual,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $$;

-- Penerimaan langsung tidak boleh melewati hasil timbang yang masih menunggu.
create or replace function public.confirm_purchase_receipt(p_id uuid,p_do uuid,p_date date,p_origin_weight numeric,p_actual_weight numeric,p_billing_quantity numeric,p_lump_amount numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if exists(select 1 from public.purchase_receipts where id=p_id) then return public.confirm_purchase_receipt_internal(p_id,p_do,p_date,p_origin_weight,p_actual_weight,p_billing_quantity,p_lump_amount,p_note); end if;
 if exists(select 1 from public.purchase_dos where id=p_do and status<>'open') then raise exception 'DO sudah ditutup'; end if;
 if exists(select 1 from public.receipt_measurements where do_id=p_do and status='pending') then raise exception 'Ada hasil timbang menunggu konfirmasi. Konfirmasi atau batalkan hasil timbang terlebih dahulu'; end if;
 return public.confirm_purchase_receipt_internal(p_id,p_do,p_date,p_origin_weight,p_actual_weight,p_billing_quantity,p_lump_amount,p_note);
end $$;

-- Konfirmasi hasil timbang memakai angka yang sudah dicatat petugas, satu kali saja.
create or replace function public.confirm_measurement(p_id uuid,p_measurement uuid,p_billing numeric,p_lump numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.receipt_measurements%rowtype;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 select * into r from public.receipt_measurements where id=p_measurement for update;
 if not found or r.status='cancelled' or (r.status='accepted' and r.receipt_id is distinct from p_id) then raise exception 'Hasil timbang tidak tersedia atau sudah dikonfirmasi'; end if;
 if not exists(select 1 from public.purchase_receipts where id=p_id) and exists(select 1 from public.purchase_dos where id=r.do_id and status<>'open') then raise exception 'DO sudah ditutup'; end if;
 perform public.confirm_purchase_receipt_internal(p_id,r.do_id,r.measurement_date,r.origin_weight,r.actual_weight,p_billing,p_lump,nullif(concat_ws(' · ',r.note,nullif(trim(p_note),'')),''));
 update public.receipt_measurements set status='accepted',receipt_id=p_id where id=p_measurement;
 return p_id;
end $$;

notify pgrst,'reload schema';
commit;
