begin;
create function public.dashboard_reminders_on(p_today date) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
     (select kind,source_id,partner_name,reference,document_date,due_date,total,paid,credited,balance from bills order by due_date nulls last,document_date,source_id limit 5) t),'[]'::jsonb)) into group_data;
   section:=section||jsonb_build_object(bucket,group_data);
  end loop;
  result:=result||jsonb_build_object(side,section);
 end loop;
 return result||jsonb_build_object('today',p_today);
end $$;
revoke all on function public.dashboard_reminders_on(date) from public,anon,authenticated;
create function public.dashboard_reminders() returns jsonb language sql stable security definer set search_path='' as $$
 select public.dashboard_reminders_on((now() at time zone 'Asia/Jakarta')::date);
$$;
revoke all on function public.dashboard_reminders() from public,anon;
grant execute on function public.dashboard_reminders() to authenticated;

create function public.set_bill_due(p_kind text,p_source uuid,p_date date) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.office_access() then raise exception 'Tidak memiliki akses'; end if;
 perform public.lock_operations();
 if p_kind is null or p_kind not in ('receivable','payable') or p_source is null or (p_date is not null and (p_date<'1900-01-01' or p_date>'9999-12-31')) then raise exception 'Tanggal jatuh tempo tidak valid'; end if;
 if not exists(select 1 from public.obligations where kind=p_kind and source_id=p_source and balance_amount>0) then raise exception 'Tagihan sudah lunas atau tidak tersedia'; end if;
 if p_kind='receivable' then update public.operations set due_date=p_date,updated_at=clock_timestamp() where id=p_source and due_date is distinct from p_date;
 else update public.purchase_receipts set due_date=p_date where id=p_source and due_date is distinct from p_date; end if;
end $$;
revoke all on function public.set_bill_due(text,uuid,date) from public,anon;
grant execute on function public.set_bill_due(text,uuid,date) to authenticated;
notify pgrst,'reload schema';
commit;
