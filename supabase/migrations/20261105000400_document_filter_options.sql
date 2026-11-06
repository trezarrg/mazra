begin;

-- Invoker access preserves the same row-level permissions as the document list.
create or replace function public.document_filter_options(p_start date default null,p_end date default null)
returns table(kind text,status text)
language sql stable security invoker set search_path='' as $$
 select distinct d.kind,
   case when d.reversed_by is not null then 'corrected'
        when d.payment_state in ('unpaid','partial') then 'unpaid'
        when d.payment_state is not null then d.payment_state
        else d.status end
 from public.workflow_documents d
 where (p_start is null or d.operation_date>=p_start)
   and (p_end is null or d.operation_date<=p_end);
$$;

revoke all on function public.document_filter_options(date,date) from public,anon;
grant execute on function public.document_filter_options(date,date) to authenticated;

commit;
