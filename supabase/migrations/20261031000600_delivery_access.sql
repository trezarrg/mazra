begin;
create or replace function public.record_delivery(p_id uuid,p_sale uuid,p_date date,p_stage text,p_items jsonb,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.operations%rowtype; e public.delivery_events%rowtype; item jsonb; line public.operation_items%rowtype; qty numeric; prior numeric; sent numeric;
begin
 perform public.lock_operations();
 select * into d from public.operations where id=p_sale and kind='sale' and status='final';
 if not found then raise exception 'Penjualan tidak ditemukan'; end if;
 if not public.office_access() and (not public.has_app_role(array['driver']) or d.assigned_to is distinct from auth.uid()) then raise exception 'Tidak memiliki akses'; end if;
 if p_id is null or p_date is null or p_stage is null or p_stage not in ('sent','received') or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 or length(coalesce(p_note,''))>1000 then raise exception 'Data pengiriman tidak valid'; end if;
 select * into e from public.delivery_events where id=p_id;
 if found then
   if e.created_by=auth.uid() and e.sale_id=p_sale and e.event_date=p_date and e.stage=p_stage and e.items=p_items and e.note is not distinct from nullif(trim(p_note),'') then return p_id; end if;
   raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if (select count(distinct x->>'item') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'Item pengiriman duplikat'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
   select * into line from public.operation_items where id=(item->>'item')::uuid and operation_id=p_sale;
   if not found then raise exception 'Item pengiriman tidak ditemukan'; end if;
   qty:=(item->>'quantity')::numeric;
   perform public.assert_stock(line.product_id,line.variant_id,line.unit,qty,false);
   select coalesce(sum((x->>'quantity')::numeric),0) into prior from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage=p_stage and x->>'item'=line.id::text;
   if p_stage='sent' then sent:=line.quantity;
   else select coalesce(sum((x->>'quantity')::numeric),0) into sent from public.delivery_events ev cross join lateral jsonb_array_elements(ev.items) x where ev.sale_id=p_sale and ev.stage='sent' and x->>'item'=line.id::text; end if;
   if prior+qty>sent then raise exception 'Jumlah pengiriman atau penerimaan melebihi dokumen asal'; end if;
 end loop;
 insert into public.delivery_events(id,sale_id,event_date,stage,items,note,created_by) values(p_id,p_sale,p_date,p_stage,p_items,nullif(trim(p_note),''),auth.uid());
 return p_id;
end $$;
notify pgrst,'reload schema';
commit;
