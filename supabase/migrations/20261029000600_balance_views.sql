begin;
create view public.stock_balances with (security_invoker = true) as
select m.product_id, m.variant_id, m.unit, p.name as product_name, v.name as variant_name, sum(m.quantity)::text as balance
from public.stock_movements m join public.products p on p.id = m.product_id
left join public.product_variants v on v.id = m.variant_id
group by m.product_id, m.variant_id, m.unit, p.name, v.name;
create view public.cash_balances with (security_invoker = true) as
select m.account_id, a.name as account_name, sum(m.amount)::text as balance
from public.cash_movements m join public.cash_accounts a on a.id = m.account_id
group by m.account_id, a.name;
create view public.stock_history with (security_invoker = true) as
select m.id, m.quantity::text as quantity, m.unit, m.movement_date, m.created_at, p.name as product_name, v.name as variant_name
from public.stock_movements m join public.products p on p.id = m.product_id left join public.product_variants v on v.id = m.variant_id;
create view public.cash_history with (security_invoker = true) as
select m.id, m.amount::text as amount, m.movement_date, m.created_at, a.name as account_name
from public.cash_movements m join public.cash_accounts a on a.id = m.account_id;
revoke all on public.stock_balances, public.cash_balances, public.stock_history, public.cash_history from anon;
grant select on public.stock_balances, public.cash_balances, public.stock_history, public.cash_history to authenticated;
notify pgrst, 'reload schema';
commit;
