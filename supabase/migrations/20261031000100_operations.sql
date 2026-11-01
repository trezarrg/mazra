begin;

-- Semua posting operasional melalui RPC; browser hanya memperoleh SELECT.
alter table public.stock_movements drop constraint stock_movements_source_type_check;
alter table public.stock_movements add constraint stock_movements_source_type_check check (source_type in ('opening','opening_correction','purchase_receipt','production','sale','sale_return','purchase_return','adjustment'));
alter table public.cash_movements drop constraint cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (source_type in ('opening','opening_correction','payment','sale','sale_return','purchase_return','finance','transfer','deposit','payroll','advance','advance_repayment'));
alter table public.stock_movements add column source_id uuid;
alter table public.cash_movements add column source_id uuid;
create index stock_source_idx on public.stock_movements(source_type,source_id);
create index stock_quantity_idx on public.stock_movements(product_id,unit,variant_id);
create index cash_source_idx on public.cash_movements(source_type,source_id);
create index cash_account_date_idx on public.cash_movements(account_id,movement_date);
alter table public.purchase_dos add column status text not null default 'open' check(status in ('open','closed','cancelled'));
alter table public.purchase_dos add column close_reason text;
alter table public.purchase_receipts add column due_date date;
alter table public.purchase_receipts add column discrepancy_review text;
drop trigger audit_purchase_dos on public.purchase_dos;
create trigger audit_purchase_dos after insert or update on public.purchase_dos for each row execute function public.audit_master_change();
create trigger audit_receipt_review after update on public.purchase_receipts for each row execute function public.audit_master_change();

create table public.finance_categories (
 code text primary key, name text not null, direction text not null check(direction in ('in','out')),
 classification text not null check(classification in ('income','expense','equity','liability','asset','owner','principal','opening')),
 active boolean not null default true
);
insert into public.finance_categories(code,name,direction,classification) values
 ('operating_income','Pendapatan usaha lain','in','income'),('capital','Modal masuk','in','equity'),
 ('loan_received','Pinjaman diterima','in','liability'),('grant','Hibah sebagai modal','in','equity'),
 ('electricity','Listrik dan air','out','expense'),('transport','Transportasi','out','expense'),
 ('supplies','Perlengkapan dan operasional','out','expense'),('interest','Bunga pinjaman','out','expense'),
 ('other_expense','Biaya usaha lain','out','expense'),('fixed_asset','Pembelian aset tetap','out','asset'),
 ('owner_draw','Prive pemilik','out','owner'),('loan_principal','Angsuran pokok pinjaman','out','principal'),
 ('opening_cash','Saldo awal kas/bank','in','opening');

create table public.operations (
 id uuid primary key, document_no bigint generated always as identity unique,
 kind text not null check(kind in ('sale','production','adjustment','sale_return','purchase_return','finance','transfer','deposit','payroll','advance','advance_repayment')),
 operation_date date not null, status text not null check(status in ('draft','final','pending','verified','cancelled')),
 partner_id uuid references public.partners(id), source_id uuid,
 assigned_to uuid references public.profiles(id), due_date date,
 account_id uuid references public.cash_accounts(id), target_account_id uuid references public.cash_accounts(id),
 category text references public.finance_categories(code), amount numeric(20,2) not null default 0 check(amount>=0),
 discount numeric(20,2) not null default 0 check(discount>=0), refund_amount numeric(20,2) not null default 0 check(refund_amount>=0), note text,
 payload jsonb not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 finalized_by uuid references auth.users(id), verified_by uuid references auth.users(id), verified_at timestamptz,
 check(status <> 'verified' or (verified_by is not null and verified_by <> created_by))
);
create table public.operation_items (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.operations(id),
 product_id uuid not null references public.products(id), variant_id uuid references public.product_variants(id),
 unit text not null references public.unit_catalog(code), quantity numeric(18,3) not null check(quantity>0),
 price numeric(20,2) not null default 0 check(price>=0), actual_weight numeric(18,3),
 direction text not null check(direction in ('in','out')), source_item_id uuid references public.operation_items(id),
 check(actual_weight is null or actual_weight>0)
);
create table public.payments (
 id uuid primary key, kind text not null check(kind in ('receivable','payable')),
 source_id uuid not null, payment_date date not null, account_id uuid not null references public.cash_accounts(id),
 amount numeric(20,2) not null check(amount>0), note text, payload jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.delivery_events (
 id uuid primary key, sale_id uuid not null references public.operations(id),
 event_date date not null, stage text not null check(stage in ('sent','received')),
 items jsonb not null, note text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index operations_date_idx on public.operations(kind,operation_date);
create index operations_source_idx on public.operations(source_id);
create index items_operation_idx on public.operation_items(operation_id);
create index payments_source_idx on public.payments(kind,source_id);
create index deliveries_sale_idx on public.delivery_events(sale_id);

create function public.office_access() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_app_role(array['developer','owner','admin'])
$$;
create function public.can_read_operation(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operations o where o.id=p_id and (public.office_access()
 or (o.kind='production' and public.has_app_role(array['production']))
 or (o.kind='sale' and o.assigned_to=auth.uid() and public.has_app_role(array['collector','driver']))
 or (o.kind='deposit' and o.created_by=auth.uid() and public.has_app_role(array['collector']))))
$$;
revoke all on function public.office_access(), public.can_read_operation(uuid) from public,anon;
grant execute on function public.office_access(), public.can_read_operation(uuid) to authenticated;

alter table public.finance_categories enable row level security;
alter table public.operations enable row level security;
alter table public.operation_items enable row level security;
alter table public.payments enable row level security;
alter table public.delivery_events enable row level security;
revoke all on public.finance_categories,public.operations,public.operation_items,public.payments,public.delivery_events from public,anon,authenticated;
grant select on public.finance_categories,public.operations,public.operation_items,public.payments,public.delivery_events to authenticated;
create policy categories_read on public.finance_categories for select to authenticated using(public.office_access());
create policy operations_read on public.operations for select to authenticated using(public.can_read_operation(id));
create policy items_read on public.operation_items for select to authenticated using(public.can_read_operation(operation_id));
create policy payments_read on public.payments for select to authenticated using(public.office_access() or (kind='receivable' and public.can_read_operation(source_id)));
create policy delivery_read on public.delivery_events for select to authenticated using(public.can_read_operation(sale_id));
create policy own_cash_read on public.cash_movements for select to authenticated using(public.has_app_role(array['collector']) and exists(select 1 from public.cash_accounts a where a.id=account_id and a.holder_id=auth.uid()));
create trigger audit_operations after insert or update on public.operations for each row execute function public.audit_master_change();
create trigger audit_items after insert or update or delete on public.operation_items for each row execute function public.audit_master_change();
create trigger audit_payments after insert on public.payments for each row execute function public.audit_master_change();
create trigger audit_deliveries after insert on public.delivery_events for each row execute function public.audit_master_change();

-- Satu kunci transaksi melindungi stok, kas, dan alokasi dari permintaan bersamaan.
create function public.lock_operations() returns void language sql set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('ayam-potong-operations',0))
$$;
revoke all on function public.lock_operations() from public,anon,authenticated;
create function public.assert_amount(p_amount numeric, p_zero boolean default false) returns void language plpgsql set search_path='' as $$
begin
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount>999999999999999.99 or p_amount<0 or (not p_zero and p_amount=0) or p_amount<>round(p_amount,2) then raise exception 'Nominal tidak valid'; end if;
end $$;
revoke all on function public.assert_amount(numeric,boolean) from public,anon,authenticated;
create function public.assert_stock(p_product uuid,p_variant uuid,p_unit text,p_qty numeric,p_active boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty<=0 or p_qty>999999999999999.999 or p_qty<>round(p_qty,3)
 or not exists(select 1 from public.products p join public.product_units u on u.product_id=p.id join public.unit_catalog c on c.code=u.unit where p.id=p_product and u.unit=p_unit and (not p_active or (p.active and c.active)) and (not c.whole_only or p_qty=trunc(p_qty)))
 or (p_variant is not null and not exists(select 1 from public.product_variants where id=p_variant and product_id=p_product and (not p_active or active))) then raise exception 'Produk, varian, satuan atau jumlah tidak valid'; end if;
end $$;
revoke all on function public.assert_stock(uuid,uuid,text,numeric,boolean) from public,anon,authenticated;
create function public.move_stock(p_id uuid,p_kind text,p_date date,p_product uuid,p_variant uuid,p_unit text,p_qty numeric,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_qty<0 and coalesce((select sum(quantity) from public.stock_movements where product_id=p_product and variant_id is not distinct from p_variant and unit=p_unit),0)+p_qty<0 then raise exception 'Stok tidak mencukupi'; end if;
 insert into public.stock_movements(product_id,variant_id,unit,quantity,movement_date,source_type,source_id,note,created_by) values(p_product,p_variant,p_unit,p_qty,p_date,p_kind,p_id,p_note,auth.uid());
end $$;
revoke all on function public.move_stock(uuid,text,date,uuid,uuid,text,numeric,text) from public,anon,authenticated;
create function public.move_cash(p_id uuid,p_kind text,p_date date,p_account uuid,p_amount numeric,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_amount=0 then return; end if;
 if not exists(select 1 from public.cash_accounts where id=p_account and active) then raise exception 'Akun kas tidak aktif'; end if;
 if p_amount<0 and coalesce((select sum(amount) from public.cash_movements where account_id=p_account),0)+p_amount<0 then raise exception 'Saldo akun tidak mencukupi'; end if;
 insert into public.cash_movements(account_id,amount,movement_date,source_type,source_id,note,created_by) values(p_account,p_amount,p_date,p_kind,p_id,p_note,auth.uid());
end $$;
revoke all on function public.move_cash(uuid,text,date,uuid,numeric,text) from public,anon,authenticated;

create view public.obligations with(security_invoker=true) as
select 'receivable'::text kind,o.id source_id,o.partner_id,p.name partner_name,'PJ-'||o.document_no reference,o.operation_date document_date,o.due_date,
 o.amount::text total,(coalesce(pay.amount,0)-coalesce(ret.refund,0))::text paid,coalesce(ret.amount,0)::text credited,
 (o.amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))::text balance,o.assigned_to
from public.operations o join public.partners p on p.id=o.partner_id
left join lateral(select sum(amount) amount from public.payments where source_id=o.id and kind='receivable') pay on true
left join lateral(select sum(amount) amount,sum(refund_amount) refund from public.operations where source_id=o.id and kind='sale_return' and status='final') ret on true
where o.kind='sale' and o.status='final'
union all
select 'payable',r.id,d.supplier_id,p.name,'DO-'||d.document_no||' / '||left(r.id::text,8),r.receipt_date,r.due_date,
 r.bill_amount::text,(coalesce(pay.amount,0)-coalesce(ret.refund,0))::text,coalesce(ret.amount,0)::text,
 (r.bill_amount-coalesce(pay.amount,0)+coalesce(ret.refund,0)-coalesce(ret.amount,0))::text,null::uuid
from public.purchase_receipts r join public.purchase_dos d on d.id=r.do_id join public.partners p on p.id=d.supplier_id
left join lateral(select sum(amount) amount from public.payments where source_id=r.id and kind='payable') pay on true
left join lateral(select sum(amount) amount,sum(refund_amount) refund from public.operations where source_id=r.id and kind='purchase_return' and status='final') ret on true;
revoke all on public.obligations from public,anon;
grant select on public.obligations to authenticated;

create function public.post_payment(p_id uuid,p_kind text,p_source uuid,p_date date,p_account uuid,p_amount numeric,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_total numeric; v_paid numeric; v_credit numeric; v_assignee uuid; v_payload jsonb; existing public.payments%rowtype;
begin
 perform public.lock_operations();
 if not public.office_access() and not public.has_app_role(array['collector']) then raise exception 'Tidak memiliki akses'; end if;
 perform public.assert_amount(p_amount);
 if p_id is null or p_date is null or p_kind is null or p_kind not in ('receivable','payable') or length(coalesce(p_note,''))>1000 then raise exception 'Data pembayaran tidak valid'; end if;
 v_payload:=jsonb_build_object('kind',p_kind,'source',p_source,'date',p_date,'account',p_account,'amount',p_amount,'note',nullif(trim(p_note),''));
 select * into existing from public.payments where id=p_id;
 if found then
   if existing.created_by=auth.uid() and existing.payload=v_payload then return p_id; end if;
   raise exception 'Permintaan sudah digunakan dengan data berbeda';
 end if;
 if p_kind='receivable' then
   select amount,assigned_to into v_total,v_assignee from public.operations where id=p_source and kind='sale' and status='final';
 else select bill_amount into v_total from public.purchase_receipts where id=p_source; end if;
 if v_total is null then raise exception 'Tagihan tidak ditemukan'; end if;
 if not public.office_access() and (p_kind<>'receivable' or v_assignee is distinct from auth.uid() or not exists(select 1 from public.cash_accounts where id=p_account and account_type='collector' and holder_id=auth.uid())) then raise exception 'Tidak memiliki akses'; end if;
 select coalesce(sum(amount),0) into v_paid from public.payments where source_id=p_source and kind=p_kind;
 select coalesce(sum(amount-refund_amount),0) into v_credit from public.operations where source_id=p_source and kind=case when p_kind='receivable' then 'sale_return' else 'purchase_return' end and status='final';
 if p_amount>v_total-v_paid-v_credit then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
 if p_kind='payable' and exists(select 1 from public.cash_accounts where id=p_account and account_type='collector') then raise exception 'Gunakan kas kantor atau bank'; end if;
 insert into public.payments values(p_id,p_kind,p_source,p_date,p_account,p_amount,nullif(trim(p_note),''),v_payload,auth.uid(),now());
 perform public.move_cash(p_id,'payment',p_date,p_account,case when p_kind='receivable' then p_amount else -p_amount end,p_note);
 return p_id;
end $$;
revoke all on function public.post_payment(uuid,text,uuid,date,uuid,numeric,text) from public,anon;
grant execute on function public.post_payment(uuid,text,uuid,date,uuid,numeric,text) to authenticated;

-- The existing receipt RPC remains compatible and now serializes with other postings.
alter function public.confirm_purchase_receipt(uuid,uuid,date,numeric,numeric,numeric,numeric,text) rename to confirm_purchase_receipt_internal;
revoke all on function public.confirm_purchase_receipt_internal(uuid,uuid,date,numeric,numeric,numeric,numeric,text) from authenticated;
create function public.confirm_purchase_receipt(p_id uuid,p_do uuid,p_date date,p_origin_weight numeric,p_actual_weight numeric,p_billing_quantity numeric,p_lump_amount numeric,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform public.lock_operations();
 if exists(select 1 from public.purchase_receipts where id=p_id) then return public.confirm_purchase_receipt_internal(p_id,p_do,p_date,p_origin_weight,p_actual_weight,p_billing_quantity,p_lump_amount,p_note); end if;
 if exists(select 1 from public.purchase_dos where id=p_do and status<>'open') then raise exception 'DO sudah ditutup'; end if;
 return public.confirm_purchase_receipt_internal(p_id,p_do,p_date,p_origin_weight,p_actual_weight,p_billing_quantity,p_lump_amount,p_note);
end $$;
revoke all on function public.confirm_purchase_receipt(uuid,uuid,date,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.confirm_purchase_receipt(uuid,uuid,date,numeric,numeric,numeric,numeric,text) to authenticated;

create function public.manage_purchase(p_id uuid,p_action text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.purchase_dos%rowtype;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_action='review' then
   if length(trim(coalesce(p_data->>'note',''))) not between 1 and 1000 then raise exception 'Alasan wajib diisi'; end if;
   update public.purchase_receipts set discrepancy_review=trim(p_data->>'note') where id=p_id;
 elsif p_action='due' then
   update public.purchase_receipts set due_date=nullif(p_data->>'due','')::date where id=p_id;
 else
   select * into d from public.purchase_dos where id=p_id for update;
   if not found then raise exception 'DO tidak ditemukan'; end if;
   if p_action in ('close','cancel') then
     if length(trim(coalesce(p_data->>'note',''))) not between 1 and 1000 then raise exception 'Alasan wajib diisi'; end if;
     if p_action='cancel' and exists(select 1 from public.purchase_receipts where do_id=p_id) then raise exception 'Gunakan retur untuk DO yang sudah diterima'; end if;
     if d.status='open' then update public.purchase_dos set status=case when p_action='close' then 'closed' else 'cancelled' end,close_reason=trim(p_data->>'note') where id=p_id; end if;
   elsif p_action='edit' then
     if d.status<>'open' or exists(select 1 from public.purchase_receipts where do_id=p_id) then raise exception 'DO yang sudah diterima tidak dapat diedit'; end if;
     perform public.assert_amount((p_data->>'price')::numeric,true);
     if not exists(select 1 from public.partners where id=(p_data->>'supplier')::uuid and active and is_supplier) then raise exception 'Supplier tidak aktif'; end if;
     perform public.assert_stock((p_data->>'product')::uuid,null,'kg',1);
     if (p_data->>'method') is null or p_data->>'method' not in ('kg','ekor','borongan') or nullif(p_data->>'date','') is null then raise exception 'Data DO tidak valid'; end if;
     if nullif(p_data->>'weight','') is not null and ((p_data->>'weight')::numeric<=0 or (p_data->>'weight')::numeric<>round((p_data->>'weight')::numeric,3)) then raise exception 'Perkiraan berat tidak valid'; end if;
     if nullif(p_data->>'count','') is not null and (p_data->>'count')::integer<=0 then raise exception 'Perkiraan ekor tidak valid'; end if;
     update public.purchase_dos set purchase_date=(p_data->>'date')::date,supplier_id=(p_data->>'supplier')::uuid,product_id=(p_data->>'product')::uuid,origin=nullif(p_data->>'origin',''),estimated_weight=nullif(p_data->>'weight','')::numeric,estimated_count=nullif(p_data->>'count','')::integer,price_method=p_data->>'method',price=(p_data->>'price')::numeric,note=nullif(p_data->>'note','') where id=p_id;
   else raise exception 'Aksi tidak valid'; end if;
 end if;
 if not found then raise exception 'Dokumen tidak ditemukan'; end if;
 return p_id;
end $$;
revoke all on function public.manage_purchase(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_purchase(uuid,text,jsonb) to authenticated;

-- Retired entry points cannot introduce a separate opening-stock workflow.
revoke execute on function public.post_opening(text,date,uuid,uuid,text,numeric,text),public.post_opening_obligation(uuid,text,text,numeric,date,date,text) from authenticated;
notify pgrst,'reload schema';
commit;
