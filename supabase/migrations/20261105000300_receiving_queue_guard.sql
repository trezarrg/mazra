begin;

-- Antrean hanya untuk penerimaan pertama. Fungsi lama tetap tersedia bagi alur
-- pengiriman tambahan pada DO yang sama; halaman antrean memakai fungsi ini.
create or replace function public.record_queue_measurement(p_id uuid,p_do uuid,p_date date,p_origin numeric,p_actual numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_role(array['developer','owner','admin','production']) then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if exists(select 1 from public.receipt_measurements where id=p_id) then
   return public.record_measurement(p_id,p_do,p_date,p_origin,p_actual,p_note);
 end if;
 if exists(select 1 from public.purchase_receipts where do_id=p_do) then raise exception 'DO sudah diterima di Pembelian. Muat ulang daftar timbang'; end if;
 return public.record_measurement(p_id,p_do,p_date,p_origin,p_actual,p_note);
end $$;
revoke all on function public.record_queue_measurement(uuid,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.record_queue_measurement(uuid,uuid,date,numeric,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
