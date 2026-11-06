begin;

create or replace function public.move_stock(p_id uuid,p_kind text,p_date date,p_product uuid,p_variant uuid,p_unit text,p_qty numeric,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare available numeric; product_label text;
begin
 if p_qty<0 then
   select coalesce(sum(quantity),0) into available from public.stock_movements where product_id=p_product and variant_id is not distinct from p_variant and unit=p_unit;
   if available+p_qty<0 then
     select concat_ws(' · ',p.name,v.name) into product_label from public.products p left join public.product_variants v on v.id=p_variant where p.id=p_product;
     raise exception 'Stok % tidak cukup.',coalesce(product_label,'produk');
   end if;
 end if;
 insert into public.stock_movements(product_id,variant_id,unit,quantity,movement_date,source_type,source_id,note,created_by)
 values(p_product,p_variant,p_unit,p_qty,p_date,p_kind,p_id,p_note,auth.uid());
end $$;

commit;
