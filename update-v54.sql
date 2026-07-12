-- DOCE ENCANTO V50 REAL — SUPABASE + TEMPO REAL
-- Execute TODO este arquivo em Supabase > SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table if not exists public.inventory (
  flavor_id text primary key,
  flavor_name text not null,
  emoji text not null default '🍫',
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 1 check (min_stock >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  created_label text,
  customer_name text not null,
  customer_phone text not null,
  items jsonb not null,
  subtotal numeric(10,2) not null,
  freight numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  fulfillment text not null check (fulfillment in ('retirada','entrega')),
  delivery_method text,
  delivery_region text,
  address jsonb,
  payment text not null,
  payment_label text,
  status text not null default 'Recebido',
  stock_restored boolean not null default false,
  delivered_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  flavor_id text not null references public.inventory(flavor_id),
  flavor_name text not null,
  emoji text,
  qty integer not null,
  reason text not null,
  order_id text references public.orders(id) on delete set null,
  actor_email text
);

insert into public.inventory (flavor_id, flavor_name, emoji, stock, min_stock)
values
  ('brigadeiro','Brigadeiro','🍫',20,8),
  ('oreo','Oreo','🖤',20,8),
  ('maracuja','Maracujá','💛',20,8),
  ('coco','Coco','🥥',20,8)
on conflict (flavor_id) do update set
  flavor_name=excluded.flavor_name,
  emoji=excluded.emoji;

create or replace function public.is_doce_encanto_admin()
returns boolean
language sql stable security definer
set search_path=public
as $$
  select coalesce(auth.jwt()->>'email','') in (
    'teteu.trufa@doceencanto.local',
    'ingrid.trufa@doceencanto.local'
  );
$$;

create or replace function public.normalize_bairro(v text)
returns text language sql immutable as $$
  select lower(translate(trim(coalesce(v,'')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'));
$$;

create or replace function public.create_order(p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_flavor jsonb;
  v_need jsonb := '{}'::jsonb;
  v_rec record;
  v_qty integer;
  v_available integer;
  v_subtotal numeric(10,2) := 0;
  v_freight numeric(10,2) := 0;
  v_total numeric(10,2);
  v_fulfillment text := coalesce(p_payload->>'fulfillment','retirada');
  v_bairro text := p_payload#>>'{address,bairro}';
  v_id text;
  v_order public.orders;
begin
  if nullif(trim(p_payload->>'customerName'),'') is null then raise exception 'Informe o nome do cliente.'; end if;
  if nullif(trim(p_payload->>'customerPhone'),'') is null then raise exception 'Informe o telefone do cliente.'; end if;
  if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then raise exception 'Carrinho vazio.'; end if;
  if v_fulfillment not in ('retirada','entrega') then raise exception 'Forma de recebimento inválida.'; end if;
  if v_fulfillment='entrega' and coalesce(p_payload->>'payment','') <> 'pix' then raise exception 'Para entrega, somente Pix.'; end if;
  if v_fulfillment='entrega' and (nullif(trim(p_payload#>>'{address,cep}'),'') is null or nullif(trim(p_payload#>>'{address,rua}'),'') is null or nullif(trim(p_payload#>>'{address,numero}'),'') is null or nullif(trim(v_bairro),'') is null) then raise exception 'Preencha o endereço completo.'; end if;

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::integer,1));
    if v_item ? 'flavors' then
      if jsonb_array_length(v_item->'flavors') <> 3 then raise exception 'Cada promoção precisa ter exatamente 3 trufas.'; end if;
      v_subtotal := v_subtotal + (14 * v_qty);
      for v_flavor in select value from jsonb_array_elements(v_item->'flavors') loop
        if (v_flavor->>'id') not in ('brigadeiro','oreo','maracuja','coco') then raise exception 'Sabor inválido.'; end if;
        v_need := jsonb_set(v_need, array[v_flavor->>'id'], to_jsonb(coalesce((v_need->>(v_flavor->>'id'))::integer,0)+v_qty), true);
      end loop;
    else
      if (v_item->>'id') not in ('brigadeiro','oreo','maracuja','coco') then raise exception 'Produto inválido.'; end if;
      v_subtotal := v_subtotal + (5 * v_qty);
      v_need := jsonb_set(v_need, array[v_item->>'id'], to_jsonb(coalesce((v_need->>(v_item->>'id'))::integer,0)+v_qty), true);
    end if;
  end loop;

  for v_rec in select key, value::integer qty from jsonb_each_text(v_need) loop
    select stock into v_available from public.inventory where flavor_id=v_rec.key for update;
    if v_available is null then raise exception 'Sabor % não encontrado.', v_rec.key; end if;
    if v_available < v_rec.qty then raise exception 'Estoque insuficiente de %. Disponível: %.', v_rec.key, v_available; end if;
  end loop;

  if v_fulfillment='entrega' then
    if v_subtotal >= 30 then v_freight := 0;
    elsif public.normalize_bairro(v_bairro) in ('pindorama','filadelfia') then v_freight := 5;
    elsif public.normalize_bairro(v_bairro) in ('gloria','coqueiros') then v_freight := 6;
    else v_freight := 10;
    end if;
  end if;
  v_total := v_subtotal + v_freight;
  v_id := 'DE' || to_char(clock_timestamp(),'YYMMDDHH24MISS') || upper(substr(md5(random()::text),1,3));

  insert into public.orders(id,created_label,customer_name,customer_phone,items,subtotal,freight,total,fulfillment,delivery_method,delivery_region,address,payment,payment_label,status)
  values(v_id,to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),trim(p_payload->>'customerName'),trim(p_payload->>'customerPhone'),p_payload->'items',v_subtotal,v_freight,v_total,v_fulfillment,case when v_fulfillment='entrega' then 'Uber Moto' else 'Retirada' end,case when v_fulfillment='entrega' then coalesce(v_bairro,'') else '' end,p_payload->'address',p_payload->>'payment',p_payload->>'paymentLabel','Recebido')
  returning * into v_order;

  for v_rec in select key, value::integer qty from jsonb_each_text(v_need) loop
    update public.inventory set stock=stock-v_rec.qty, updated_at=now() where flavor_id=v_rec.key;
    insert into public.stock_movements(type,flavor_id,flavor_name,emoji,qty,reason,order_id)
      select 'Saída', flavor_id, flavor_name, emoji, -v_rec.qty, 'Pedido finalizado', v_id from public.inventory where flavor_id=v_rec.key;
  end loop;
  return to_jsonb(v_order);
end;
$$;

create or replace function public.admin_set_inventory(p_flavor_id text, p_stock integer, p_min_stock integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old integer; v_row public.inventory;
begin
  if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.'; end if;
  if p_stock < 0 or p_min_stock < 0 then raise exception 'Quantidade inválida.'; end if;
  select stock into v_old from public.inventory where flavor_id=p_flavor_id for update;
  if v_old is null then raise exception 'Sabor não encontrado.'; end if;
  update public.inventory set stock=p_stock,min_stock=p_min_stock,updated_at=now() where flavor_id=p_flavor_id returning * into v_row;
  if p_stock <> v_old then
    insert into public.stock_movements(type,flavor_id,flavor_name,emoji,qty,reason,actor_email)
      values(case when p_stock>v_old then 'Entrada' else 'Ajuste' end,v_row.flavor_id,v_row.flavor_name,v_row.emoji,p_stock-v_old,'Ajuste manual de estoque',auth.jwt()->>'email');
  end if;
  return to_jsonb(v_row);
end; $$;

create or replace function public.admin_update_order_status(p_order_id text, p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.orders; v_item jsonb; v_flavor jsonb; v_need jsonb:='{}'::jsonb; v_rec record; v_qty integer;
begin
  if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado.'; end if;
  if p_status='Cancelado' and not v_order.stock_restored then
    for v_item in select value from jsonb_array_elements(v_order.items) loop
      v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));
      if v_item ? 'flavors' then
        for v_flavor in select value from jsonb_array_elements(v_item->'flavors') loop
          v_need:=jsonb_set(v_need,array[v_flavor->>'id'],to_jsonb(coalesce((v_need->>(v_flavor->>'id'))::integer,0)+v_qty),true);
        end loop;
      else
        v_need:=jsonb_set(v_need,array[v_item->>'id'],to_jsonb(coalesce((v_need->>(v_item->>'id'))::integer,0)+v_qty),true);
      end if;
    end loop;
    for v_rec in select key,value::integer qty from jsonb_each_text(v_need) loop
      update public.inventory set stock=stock+v_rec.qty,updated_at=now() where flavor_id=v_rec.key;
      insert into public.stock_movements(type,flavor_id,flavor_name,emoji,qty,reason,order_id,actor_email)
        select 'Cancelamento',flavor_id,flavor_name,emoji,v_rec.qty,'Pedido cancelado / estoque devolvido',p_order_id,auth.jwt()->>'email' from public.inventory where flavor_id=v_rec.key;
    end loop;
  end if;
  update public.orders set status=p_status,stock_restored=case when p_status='Cancelado' then true else stock_restored end,delivered_at=case when p_status='Entregue' then now() else delivered_at end,canceled_at=case when p_status='Cancelado' then now() else canceled_at end,updated_at=now() where id=p_order_id returning * into v_order;
  return to_jsonb(v_order);
end; $$;

alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists inventory_public_read on public.inventory;
create policy inventory_public_read on public.inventory for select to anon,authenticated using (true);

drop policy if exists inventory_admin_update on public.inventory;
create policy inventory_admin_update on public.inventory for update to authenticated using (public.is_doce_encanto_admin()) with check (public.is_doce_encanto_admin());

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated using (public.is_doce_encanto_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update to authenticated using (public.is_doce_encanto_admin()) with check (public.is_doce_encanto_admin());

drop policy if exists stock_moves_admin_read on public.stock_movements;
create policy stock_moves_admin_read on public.stock_movements for select to authenticated using (public.is_doce_encanto_admin());

revoke all on public.orders from anon,authenticated;
revoke all on public.stock_movements from anon,authenticated;
grant select on public.inventory to anon,authenticated;
grant select,update on public.orders to authenticated;
grant select on public.stock_movements to authenticated;
grant execute on function public.create_order(jsonb) to anon,authenticated;
grant execute on function public.admin_set_inventory(text,integer,integer) to authenticated;
grant execute on function public.admin_update_order_status(text,text) to authenticated;

-- Realtime (ignora se a tabela já estiver na publicação)
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory') then alter publication supabase_realtime add table public.inventory; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then alter publication supabase_realtime add table public.orders; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stock_movements') then alter publication supabase_realtime add table public.stock_movements; end if;
end $$;


-- ===== ATUALIZAÇÃO V54 =====
-- DOCE ENCANTO V54 OFICIAL — INSTALAÇÃO/ATUALIZAÇÃO SEGURA
-- Pode ser executado novamente: usa IF NOT EXISTS e CREATE OR REPLACE.
create extension if not exists pgcrypto;

create table if not exists public.inventory (
  flavor_id text primary key, flavor_name text not null, emoji text not null default '🍫',
  stock integer not null default 0 check(stock>=0), min_stock integer not null default 1 check(min_stock>=0), updated_at timestamptz not null default now()
);
create table if not exists public.orders (
  id text primary key, created_at timestamptz not null default now(), created_label text,
  customer_name text not null, customer_phone text not null, items jsonb not null,
  subtotal numeric(10,2) not null, freight numeric(10,2) not null default 0, total numeric(10,2) not null,
  fulfillment text not null check(fulfillment in('retirada','entrega')), delivery_method text, delivery_region text,
  address jsonb, payment text not null, payment_label text, status text not null default 'Recebido', stock_restored boolean not null default false,
  ready_at timestamptz, delivered_at timestamptz, canceled_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists ready_at timestamptz;
create table if not exists public.stock_movements (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), type text not null,
 flavor_id text not null references public.inventory(flavor_id), flavor_name text not null, emoji text, qty integer not null,
 reason text not null, order_id text references public.orders(id) on delete set null, actor_email text
);
create table if not exists public.delivery_zones (
 id uuid primary key default gen_random_uuid(), name text not null, normalized_name text not null unique,
 fee numeric(10,2) not null check(fee>=0), active boolean not null default true,
 latitude numeric(10,7), longitude numeric(10,7), updated_at timestamptz not null default now()
);

insert into public.inventory(flavor_id,flavor_name,emoji,stock,min_stock) values
 ('brigadeiro','Brigadeiro','🍫',20,8),('oreo','Oreo','🖤',20,8),('maracuja','Maracujá','💛',20,8),('coco','Coco','🥥',20,8),
 ('morango','Morango','🍓',0,0),('uva-verde','Uva Verde','🍇',0,0)
on conflict(flavor_id) do update set flavor_name=excluded.flavor_name,emoji=excluded.emoji;

create or replace function public.normalize_bairro(v text) returns text language sql immutable as $$
 select regexp_replace(lower(translate(trim(coalesce(v,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'\\s+',' ','g');
$$;
insert into public.delivery_zones(name,normalized_name,fee,active) values
 ('Pindorama',public.normalize_bairro('Pindorama'),5,true),('Filadélfia',public.normalize_bairro('Filadélfia'),5,true),
 ('Jardim Filadélfia',public.normalize_bairro('Jardim Filadélfia'),5,true),('Novo Glória',public.normalize_bairro('Novo Glória'),6,true)
on conflict(normalized_name) do update set name=excluded.name,fee=excluded.fee,active=true,updated_at=now();

create or replace function public.is_doce_encanto_admin() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(auth.jwt()->>'email','') in ('teteu.trufa@doceencanto.local','ingrid.trufa@doceencanto.local');
$$;

create or replace function public.create_order(p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item jsonb;v_flavor jsonb;v_need jsonb:='{}'::jsonb;v_rec record;v_qty int;v_available int;v_subtotal numeric(10,2):=0;v_freight numeric(10,2):=0;v_total numeric(10,2);v_fulfillment text:=coalesce(p_payload->>'fulfillment','retirada');v_bairro text:=p_payload#>>'{address,bairro}';v_id text;v_order public.orders;v_zone numeric(10,2);
begin
 if nullif(trim(p_payload->>'customerName'),'') is null then raise exception 'Informe o nome do cliente.';end if;
 if nullif(trim(p_payload->>'customerPhone'),'') is null then raise exception 'Informe o telefone do cliente.';end if;
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'Carrinho vazio.';end if;
 if v_fulfillment not in('retirada','entrega') then raise exception 'Forma de recebimento inválida.';end if;
 if v_fulfillment='entrega' and coalesce(p_payload->>'payment','')<>'pix' then raise exception 'Para entrega, somente Pix.';end if;
 if v_fulfillment='entrega' and nullif(trim(v_bairro),'') is null then raise exception 'Informe o bairro.';end if;
 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
  v_qty:=greatest(1,coalesce((v_item->>'qty')::int,1));
  if v_item?'flavors' then
   if jsonb_array_length(v_item->'flavors')<>3 then raise exception 'Cada promoção precisa ter 3 trufas.';end if;v_subtotal:=v_subtotal+14*v_qty;
   for v_flavor in select value from jsonb_array_elements(v_item->'flavors') loop
    if (v_flavor->>'id') not in('brigadeiro','oreo','maracuja','coco') then raise exception 'Sabor indisponível.';end if;
    v_need:=jsonb_set(v_need,array[v_flavor->>'id'],to_jsonb(coalesce((v_need->>(v_flavor->>'id'))::int,0)+v_qty),true);
   end loop;
  else
   if (v_item->>'id') not in('brigadeiro','oreo','maracuja','coco') then raise exception 'Produto indisponível.';end if;
   v_subtotal:=v_subtotal+5*v_qty;v_need:=jsonb_set(v_need,array[v_item->>'id'],to_jsonb(coalesce((v_need->>(v_item->>'id'))::int,0)+v_qty),true);
  end if;
 end loop;
 for v_rec in select key,value::int qty from jsonb_each_text(v_need) loop select stock into v_available from public.inventory where flavor_id=v_rec.key for update;if coalesce(v_available,0)<v_rec.qty then raise exception 'Estoque insuficiente de %.',v_rec.key;end if;end loop;
 if v_fulfillment='entrega' then if v_subtotal>=30 then v_freight:=0;else select fee into v_zone from public.delivery_zones where active and normalized_name=public.normalize_bairro(v_bairro) limit 1;v_freight:=coalesce(v_zone,10);end if;end if;
 v_total:=v_subtotal+v_freight;v_id:='DE'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||upper(substr(md5(random()::text),1,3));
 insert into public.orders(id,created_label,customer_name,customer_phone,items,subtotal,freight,total,fulfillment,delivery_method,delivery_region,address,payment,payment_label,status)
 values(v_id,to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),trim(p_payload->>'customerName'),trim(p_payload->>'customerPhone'),p_payload->'items',v_subtotal,v_freight,v_total,v_fulfillment,case when v_fulfillment='entrega' then 'Uber Moto' else 'Retirada' end,coalesce(v_bairro,''),p_payload->'address',p_payload->>'payment',p_payload->>'paymentLabel','Recebido') returning * into v_order;
 for v_rec in select key,value::int qty from jsonb_each_text(v_need) loop update public.inventory set stock=stock-v_rec.qty,updated_at=now() where flavor_id=v_rec.key;insert into public.stock_movements(type,flavor_id,flavor_name,emoji,qty,reason,order_id) select 'Saída',flavor_id,flavor_name,emoji,-v_rec.qty,'Pedido finalizado',v_id from public.inventory where flavor_id=v_rec.key;end loop;
 return to_jsonb(v_order);
end$$;

create or replace function public.admin_set_inventory(p_flavor_id text,p_stock int,p_min_stock int) returns jsonb language plpgsql security definer set search_path=public as $$declare v_old int;v_row public.inventory;begin if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.';end if;select stock into v_old from public.inventory where flavor_id=p_flavor_id for update;update public.inventory set stock=greatest(0,p_stock),min_stock=greatest(0,p_min_stock),updated_at=now() where flavor_id=p_flavor_id returning * into v_row;if p_stock<>v_old then insert into public.stock_movements(type,flavor_id,flavor_name,emoji,qty,reason,actor_email) values(case when p_stock>v_old then 'Entrada' else 'Ajuste' end,v_row.flavor_id,v_row.flavor_name,v_row.emoji,p_stock-v_old,'Ajuste manual',auth.jwt()->>'email');end if;return to_jsonb(v_row);end$$;
create or replace function public.admin_update_order_status(p_order_id text,p_status text) returns jsonb language plpgsql security definer set search_path=public as $$declare v_order public.orders;v_item jsonb;v_flavor jsonb;v_need jsonb:='{}'::jsonb;v_rec record;v_qty int;begin if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.';end if;select * into v_order from public.orders where id=p_order_id for update;if v_order.id is null then raise exception 'Pedido não encontrado.';end if;if p_status='Cancelado' and not v_order.stock_restored then for v_item in select value from jsonb_array_elements(v_order.items) loop v_qty:=greatest(1,coalesce((v_item->>'qty')::int,1));if v_item?'flavors' then for v_flavor in select value from jsonb_array_elements(v_item->'flavors') loop v_need:=jsonb_set(v_need,array[v_flavor->>'id'],to_jsonb(coalesce((v_need->>(v_flavor->>'id'))::int,0)+v_qty),true);end loop;else v_need:=jsonb_set(v_need,array[v_item->>'id'],to_jsonb(coalesce((v_need->>(v_item->>'id'))::int,0)+v_qty),true);end if;end loop;for v_rec in select key,value::int qty from jsonb_each_text(v_need) loop update public.inventory set stock=stock+v_rec.qty,updated_at=now() where flavor_id=v_rec.key;insert into public.stock_movements(type,flavor_id,flavor_name,emoji,qty,reason,order_id,actor_email) select 'Cancelamento',flavor_id,flavor_name,emoji,v_rec.qty,'Pedido cancelado / estoque devolvido',p_order_id,auth.jwt()->>'email' from public.inventory where flavor_id=v_rec.key;end loop;end if;update public.orders set status=p_status,stock_restored=case when p_status='Cancelado' then true else stock_restored end,ready_at=case when p_status='Pronto' then now() else ready_at end,delivered_at=case when p_status='Entregue' then now() else delivered_at end,canceled_at=case when p_status='Cancelado' then now() else canceled_at end,updated_at=now() where id=p_order_id returning * into v_order;return to_jsonb(v_order);end$$;
create or replace function public.admin_save_delivery_zones(p_zones jsonb) returns void language plpgsql security definer set search_path=public as $$declare z jsonb;ids uuid[]:='{}';newid uuid;begin if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.';end if;for z in select value from jsonb_array_elements(p_zones) loop if nullif(trim(z->>'name'),'') is null then continue;end if;insert into public.delivery_zones(id,name,normalized_name,fee,active,latitude,longitude,updated_at) values(coalesce(nullif(z->>'id','')::uuid,gen_random_uuid()),trim(z->>'name'),public.normalize_bairro(z->>'name'),greatest(0,coalesce((z->>'fee')::numeric,0)),coalesce((z->>'active')::boolean,true),nullif(z->>'latitude','')::numeric,nullif(z->>'longitude','')::numeric,now()) on conflict(normalized_name) do update set name=excluded.name,fee=excluded.fee,active=excluded.active,latitude=excluded.latitude,longitude=excluded.longitude,updated_at=now() returning id into newid;ids:=array_append(ids,newid);end loop;delete from public.delivery_zones where not(id=any(ids));end$$;
create or replace function public.admin_reset_test_data() returns void language plpgsql security definer set search_path=public as $$begin if not public.is_doce_encanto_admin() then raise exception 'Acesso negado.';end if;delete from public.stock_movements;delete from public.orders;end$$;

alter table public.inventory enable row level security;alter table public.orders enable row level security;alter table public.stock_movements enable row level security;alter table public.delivery_zones enable row level security;
drop policy if exists inventory_public_read on public.inventory;create policy inventory_public_read on public.inventory for select to anon,authenticated using(true);
drop policy if exists orders_admin_read on public.orders;create policy orders_admin_read on public.orders for select to authenticated using(public.is_doce_encanto_admin());
drop policy if exists stock_moves_admin_read on public.stock_movements;create policy stock_moves_admin_read on public.stock_movements for select to authenticated using(public.is_doce_encanto_admin());
drop policy if exists delivery_zones_public_read on public.delivery_zones;create policy delivery_zones_public_read on public.delivery_zones for select to anon,authenticated using(true);
grant select on public.inventory,public.delivery_zones to anon,authenticated;grant select on public.orders,public.stock_movements to authenticated;
grant execute on function public.create_order(jsonb) to anon,authenticated;grant execute on function public.admin_set_inventory(text,int,int),public.admin_update_order_status(text,text),public.admin_save_delivery_zones(jsonb),public.admin_reset_test_data() to authenticated;
do $$begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory') then alter publication supabase_realtime add table public.inventory;end if;if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then alter publication supabase_realtime add table public.orders;end if;if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stock_movements') then alter publication supabase_realtime add table public.stock_movements;end if;if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='delivery_zones') then alter publication supabase_realtime add table public.delivery_zones;end if;end$$;


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
