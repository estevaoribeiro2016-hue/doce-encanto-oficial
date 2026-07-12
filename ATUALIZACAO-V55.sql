-- DOCE ENCANTO V55 — atualização segura sobre a V54.7
alter table public.orders add column if not exists is_test boolean not null default false;
alter table public.orders add column if not exists revenue_adjustment numeric(10,2) not null default 0;

create table if not exists public.revenue_adjustments (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 order_id text not null references public.orders(id) on delete cascade,
 original_total numeric(10,2) not null, corrected_total numeric(10,2) not null,
 adjustment numeric(10,2) not null, reason text not null, actor_email text
);

create or replace function public.normalize_phone_v55(v text) returns text language sql immutable as $$
 select regexp_replace(coalesce(v,''),'\\D','','g')
$$;

create or replace function public.get_customer_orders_v55(p_phone text)
returns setof public.orders language sql security definer set search_path=public as $$
 select * from public.orders
 where right(public.normalize_phone_v55(customer_phone),8)=right(public.normalize_phone_v55(p_phone),8)
 order by created_at desc limit 50
$$;

create or replace function public.admin_mark_order_test_v55(p_order_id text,p_is_test boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.orders;
begin
 if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.'; end if;
 update public.orders set is_test=p_is_test,updated_at=now() where id=p_order_id returning * into v;
 if v.id is null then raise exception 'Pedido não encontrado.'; end if;
 return to_jsonb(v);
end $$;

create or replace function public.admin_adjust_order_revenue_v55(p_order_id text,p_corrected_total numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.orders; v_email text:=auth.jwt()->>'email'; v_adjust numeric;
begin
 if v_email<>'teteu.trufa@doceencanto.local' then raise exception 'Somente Teteu pode corrigir o faturamento.'; end if;
 if p_corrected_total<0 then raise exception 'Valor inválido.'; end if;
 select * into v from public.orders where id=p_order_id for update;
 if v.id is null then raise exception 'Pedido não encontrado.'; end if;
 v_adjust:=p_corrected_total-v.total;
 insert into public.revenue_adjustments(order_id,original_total,corrected_total,adjustment,reason,actor_email)
 values(v.id,v.total,p_corrected_total,v_adjust,trim(p_reason),v_email);
 update public.orders set revenue_adjustment=v_adjust,updated_at=now() where id=v.id returning * into v;
 return to_jsonb(v);
end $$;

alter table public.revenue_adjustments enable row level security;
drop policy if exists revenue_adjustments_admin_read on public.revenue_adjustments;
create policy revenue_adjustments_admin_read on public.revenue_adjustments for select to authenticated using(public.is_doce_encanto_admin());
grant select on public.revenue_adjustments to authenticated;
grant execute on function public.get_customer_orders_v55(text) to anon,authenticated;
grant execute on function public.admin_mark_order_test_v55(text,boolean) to authenticated;
grant execute on function public.admin_adjust_order_revenue_v55(text,numeric,text) to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='revenue_adjustments') then alter publication supabase_realtime add table public.revenue_adjustments; end if;
end $$;
