begin;
create function public.guard_master_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'product_units' then
    if exists (select 1 from public.stock_movements where product_id = old.product_id and unit = old.unit) then
      raise exception 'Satuan yang sudah memiliki gerakan stok tidak dapat dihapus';
    end if;
    return old;
  elsif tg_table_name = 'product_variants' then
    if new.product_id <> old.product_id then raise exception 'Varian tidak dapat dipindahkan ke produk lain'; end if;
  elsif tg_table_name = 'cash_accounts' then
    if (new.account_type is distinct from old.account_type or new.holder_id is distinct from old.holder_id)
      and exists (select 1 from public.cash_movements where account_id = old.id) then
      raise exception 'Jenis atau pemegang akun dengan gerakan kas tidak dapat diubah';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_master_history() from public, anon, authenticated;
create trigger guard_unit_history before delete on public.product_units for each row execute function public.guard_master_history();
create trigger guard_variant_product before update on public.product_variants for each row execute function public.guard_master_history();
create trigger guard_account_history before update on public.cash_accounts for each row execute function public.guard_master_history();
commit;
