-- Fondasi aplikasi baru. Jalankan hanya pada proyek yang telah dipastikan.
begin;

-- Pemicu lama merujuk skema profil yang sudah dibersihkan dan tidak cocok dengan fondasi ini.
drop trigger if exists ayam_potong_auth_user_created on auth.users;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  role text not null check (role in ('owner', 'admin', 'production', 'driver', 'collector')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SECURITY DEFINER avoids recursive RLS; inactive and unregistered users have no role.
create function public.current_app_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and active $$;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_supplier boolean not null default false,
  is_customer boolean not null default false,
  phone text,
  address text,
  notes text,
  payment_term_days integer check (payment_term_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_supplier or is_customer)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, name)
);
create table public.product_units (
  product_id uuid not null references public.products(id) on delete restrict,
  unit text not null check (unit in ('kg', 'ekor', 'pcs')),
  primary key (product_id, unit)
);
create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  account_type text not null check (account_type in ('cash', 'bank', 'collector')),
  holder_id uuid references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((account_type = 'collector') = (holder_id is not null))
);
create table public.business_settings (
  id boolean primary key default true check (id),
  name text not null default 'Usaha Ayam Potong',
  phone text,
  address text,
  timezone text not null default 'Asia/Jakarta',
  updated_at timestamptz not null default now()
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete restrict,
  table_name text not null,
  record_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create function public.audit_master_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_id, table_name, record_id, action, before_data, after_data)
  values (auth.uid(), tg_table_name, coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'), tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.audit_master_change() from public, anon, authenticated;

create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_master_change();
create trigger audit_partners after insert or update or delete on public.partners for each row execute function public.audit_master_change();
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_master_change();
create trigger audit_variants after insert or update or delete on public.product_variants for each row execute function public.audit_master_change();
create trigger audit_accounts after insert or update or delete on public.cash_accounts for each row execute function public.audit_master_change();
create trigger audit_settings after insert or update or delete on public.business_settings for each row execute function public.audit_master_change();

alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_units enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.business_settings enable row level security;
alter table public.audit_events enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles, public.partners, public.products,
  public.product_variants, public.product_units, public.cash_accounts, public.business_settings to authenticated;
grant select on public.audit_events to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.current_app_role() = 'owner');
create policy profiles_owner on public.profiles for all to authenticated using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');
create policy partners_read on public.partners for select to authenticated using (public.current_app_role() in ('owner','admin'));
create policy partners_write on public.partners for all to authenticated using (public.current_app_role() in ('owner','admin')) with check (public.current_app_role() in ('owner','admin'));
create policy products_read on public.products for select to authenticated using (public.current_app_role() in ('owner','admin','production'));
create policy products_write on public.products for all to authenticated using (public.current_app_role() in ('owner','admin')) with check (public.current_app_role() in ('owner','admin'));
create policy variants_read on public.product_variants for select to authenticated using (public.current_app_role() in ('owner','admin','production'));
create policy variants_write on public.product_variants for all to authenticated using (public.current_app_role() in ('owner','admin')) with check (public.current_app_role() in ('owner','admin'));
create policy units_read on public.product_units for select to authenticated using (public.current_app_role() in ('owner','admin','production'));
create policy units_write on public.product_units for all to authenticated using (public.current_app_role() in ('owner','admin')) with check (public.current_app_role() in ('owner','admin'));
create policy accounts_read on public.cash_accounts for select to authenticated using (public.current_app_role() in ('owner','admin') or (public.current_app_role() = 'collector' and holder_id = auth.uid()));
create policy accounts_write on public.cash_accounts for all to authenticated using (public.current_app_role() in ('owner','admin')) with check (public.current_app_role() in ('owner','admin'));
create policy settings_read on public.business_settings for select to authenticated using (public.current_app_role() is not null);
create policy settings_write on public.business_settings for all to authenticated using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');
create policy audit_read on public.audit_events for select to authenticated using (public.current_app_role() = 'owner');

-- Master records are deactivated, never deleted through the application.
revoke delete on public.profiles, public.partners, public.products, public.product_variants,
  public.product_units, public.cash_accounts, public.business_settings from authenticated;

insert into public.business_settings default values;
insert into public.partners(name, is_customer) values ('Pelanggan Umum', true);
insert into public.products(name) values ('Ayam Hidup'), ('Karkas'), ('Dada'), ('Paha'), ('Sayap'), ('Fillet'), ('Ceker'), ('Kepala'), ('Jeroan');
insert into public.product_units(product_id, unit) select id, 'kg' from public.products;
insert into public.product_units(product_id, unit) select id, 'ekor' from public.products where name = 'Ayam Hidup';
insert into public.cash_accounts(name, account_type) values ('Kas Kantor', 'cash');

commit;
