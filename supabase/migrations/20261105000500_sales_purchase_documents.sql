begin;

create or replace view public.sales_purchase_documents with(security_invoker=true) as
select d.id,d.document_no,d.kind,d.operation_date,d.status,d.amount,d.created_at,
 d.reversed_by,d.partner_name,d.search_text,
 case when b.balance_amount<=0 then 'paid' else 'unpaid' end payment_state,
 d.href
from public.workflow_documents d
join public.obligations b on b.source_id=d.id
 and b.kind=case when d.kind='sale' then 'receivable' else 'payable' end
where d.kind in ('sale','purchase_receipt') and d.status='final' and d.reversed_by is null;

revoke all on public.sales_purchase_documents from public,anon;
grant select on public.sales_purchase_documents to authenticated;

-- The document module now has two fixed types and two payment statuses.
drop function if exists public.document_filter_options(date,date);

commit;
