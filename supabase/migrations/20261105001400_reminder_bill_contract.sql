begin;
-- Reminder items share the existing invoice/payment interface.
create or replace function public.dashboard_reminders_on(p_today date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}'; side text; bucket text; section jsonb; group_data jsonb;
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 foreach side in array array['receivable','payable'] loop
  section:='{}';
  foreach bucket in array array['overdue','today','tomorrow','unscheduled'] loop
   with bills as (
    select * from public.obligations where kind=side and balance_amount>0 and
     case bucket when 'overdue' then due_date<p_today when 'today' then due_date=p_today when 'tomorrow' then due_date=p_today+1 else due_date is null end
   ) select jsonb_build_object('count',(select count(*) from bills),'total',(select coalesce(sum(balance_amount),0)::text from bills),
    'items',coalesce((select jsonb_agg(t order by t.due_date nulls last,t.document_date,t.source_id) from
     (select kind,source_id,partner_id,partner_name,reference,document_date,due_date,total,paid,credited,balance from bills order by due_date nulls last,document_date,source_id limit 5) t),'[]'::jsonb)) into group_data;
   section:=section||jsonb_build_object(bucket,group_data);
  end loop;
  result:=result||jsonb_build_object(side,section);
 end loop;
 return result||jsonb_build_object('today',p_today);
end $$;

notify pgrst,'reload schema';
commit;
