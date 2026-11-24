-- ===== Roles & members =====
create type public.app_role as enum ('admin', 'empleado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _user_id and active)
$$;

create policy "Ver mi perfil o miembros ven todos" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member(auth.uid()));
create policy "Editar mi nombre" on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Ver roles propios o admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_member(auth.uid()));
create policy "Admin asigna roles" on public.user_roles for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy "Admin quita roles" on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') and user_id <> auth.uid());

-- prevent non-admins from activating themselves
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active is distinct from old.active and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Solo un administrador puede activar o desactivar usuarios';
  end if;
  if new.active is distinct from old.active and new.id = auth.uid() then
    raise exception 'No puedes desactivarte a ti mismo';
  end if;
  new.email := old.email;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_first boolean;
begin
  select not exists (select 1 from public.profiles where active) into is_first;
  insert into public.profiles (id, display_name, email, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    new.email,
    is_first
  );
  insert into public.user_roles (user_id, role) values (new.id, 'empleado') on conflict do nothing;
  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Settings =====
create table public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Inversiones El Nonno, C.A.',
  rif text not null default '',
  phone text not null default '',
  address text not null default '',
  rate numeric(14,4) not null default 1,
  rate_source text not null default 'bcv',
  rate_updated_at timestamptz not null default now(),
  price_list_note text not null default 'Precios sujetos a cambio sin previo aviso.'
);
grant select, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "Miembros ven ajustes" on public.settings for select to authenticated using (public.is_member(auth.uid()));
create policy "Miembros editan ajustes" on public.settings for update to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));

-- ===== Catalog =====
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_key text,
  image_url text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  unit text not null default 'und',
  price_detal numeric(14,4) not null default 0,
  price_mayor numeric(14,4) not null default 0,
  cost numeric(14,4) not null default 0,
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  presentations jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rif text not null default '',
  phone text not null default '',
  address text not null default '',
  kind text not null default 'detal',
  credit_limit numeric(14,2) not null default 0,
  credit_days int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rif text not null default '',
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

-- ===== Transactions =====
create sequence public.seq_cotizacion;
create sequence public.seq_pedido;
create sequence public.seq_factura;
create sequence public.seq_compra;

create table public.sales_docs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  number text not null unique,
  status text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default 'Cliente de contado',
  price_kind text not null default 'detal',
  payment_type text not null default 'contado',
  items jsonb not null default '[]'::jsonb,
  total_usd numeric(14,2) not null default 0,
  paid_usd numeric(14,2) not null default 0,
  rate numeric(14,4) not null default 1,
  note text not null default '',
  source_id uuid references public.sales_docs(id) on delete set null,
  due_date date,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index on public.sales_docs (kind, created_at desc);
create index on public.sales_docs (client_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references public.sales_docs(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  method text not null,
  amount_usd numeric(14,2) not null default 0,
  amount_bs numeric(16,2) not null default 0,
  rate numeric(14,4) not null default 1,
  reference text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid
);
create index on public.payments (created_at);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text not null default '',
  invoice_no text not null default '',
  control_no text not null default '',
  invoice_date date not null default current_date,
  items jsonb not null default '[]'::jsonb,
  total_usd numeric(14,2) not null default 0,
  paid_usd numeric(14,2) not null default 0,
  payment_type text not null default 'contado',
  status text not null default 'registrada',
  rate numeric(14,4) not null default 1,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade not null,
  qty numeric(14,3) not null,
  kind text not null,
  reason text not null default '',
  ref text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid
);
create index on public.stock_movements (product_id, created_at desc);

create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  opening_usd numeric(14,2) not null default 0,
  opening_bs numeric(16,2) not null default 0,
  counted_usd numeric(14,2) not null default 0,
  counted_bs numeric(16,2) not null default 0,
  pos_batch text not null default '',
  pos_amount_bs numeric(16,2) not null default 0,
  note text not null default '',
  closed_at timestamptz not null default now(),
  closed_by uuid
);

-- grants + RLS for all business tables (shared by active members)
do $$
declare t text;
begin
  foreach t in array array['categories','products','clients','suppliers','sales_docs','payments','purchases','stock_movements','cash_closings'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Miembros ven" on public.%I for select to authenticated using (public.is_member(auth.uid()))', t);
    execute format('create policy "Miembros crean" on public.%I for insert to authenticated with check (public.is_member(auth.uid()))', t);
    execute format('create policy "Miembros editan" on public.%I for update to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()))', t);
    execute format('create policy "Miembros borran" on public.%I for delete to authenticated using (public.is_member(auth.uid()))', t);
  end loop;
end $$;

-- ===== Business functions =====
create or replace function public.reserved_qty(_product_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum((i->>'qty')::numeric), 0)
  from public.sales_docs d, jsonb_array_elements(d.items) i
  where d.kind = 'pedido' and d.status = 'por_facturar' and (i->>'product_id')::uuid = _product_id
$$;

create or replace function public.next_number(_kind text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if _kind = 'cotizacion' then return 'COT-' || lpad(nextval('public.seq_cotizacion')::text, 6, '0');
  elsif _kind = 'pedido' then return 'PED-' || lpad(nextval('public.seq_pedido')::text, 6, '0');
  elsif _kind = 'factura' then return 'FAC-' || lpad(nextval('public.seq_factura')::text, 6, '0');
  elsif _kind = 'compra' then return 'COM-' || lpad(nextval('public.seq_compra')::text, 6, '0');
  end if;
  raise exception 'Tipo desconocido %', _kind;
end $$;

-- internal: insert payments array and return total usd
create or replace function public._insert_payments(_doc_id uuid, _client_id uuid, _payments jsonb, _rate numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare p jsonb; total numeric := 0;
begin
  for p in select * from jsonb_array_elements(coalesce(_payments, '[]'::jsonb)) loop
    if coalesce((p->>'amount_usd')::numeric, 0) <= 0 then continue; end if;
    insert into public.payments (doc_id, client_id, method, amount_usd, amount_bs, rate, reference, created_by)
    values (_doc_id, _client_id, p->>'method', (p->>'amount_usd')::numeric,
            coalesce((p->>'amount_bs')::numeric, 0), _rate, coalesce(p->>'reference', ''), auth.uid());
    total := total + (p->>'amount_usd')::numeric;
  end loop;
  return total;
end $$;

-- internal: deduct stock for items of a doc
create or replace function public._deduct_stock(_items jsonb, _ref text, _exclude_reserved_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i jsonb; pr record; avail numeric;
begin
  for i in select * from jsonb_array_elements(_items) loop
    select * into pr from public.products where id = (i->>'product_id')::uuid for update;
    if not found then raise exception 'Producto no encontrado'; end if;
    avail := pr.stock - public.reserved_qty(pr.id);
    if _exclude_reserved_doc is not null then
      avail := avail + coalesce((select sum((x->>'qty')::numeric) from public.sales_docs d, jsonb_array_elements(d.items) x
        where d.id = _exclude_reserved_doc and (x->>'product_id')::uuid = pr.id), 0);
    end if;
    if avail + 0.0005 < (i->>'qty')::numeric then
      raise exception 'No hay suficiente "%": quedan % disponibles', pr.name, round(avail, 3);
    end if;
    update public.products set stock = stock - (i->>'qty')::numeric where id = pr.id;
    insert into public.stock_movements (product_id, qty, kind, reason, ref, created_by)
    values (pr.id, -((i->>'qty')::numeric), 'venta', 'Venta', _ref, auth.uid());
  end loop;
end $$;

create or replace function public.create_sale_doc(
  p_kind text, p_client_id uuid, p_items jsonb, p_payment_type text,
  p_note text, p_payments jsonb, p_rate numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_number text; v_total numeric; v_paid numeric := 0; v_client record;
  v_status text; v_client_name text := 'Cliente de contado'; v_price_kind text := 'detal';
  i jsonb; v_due date;
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_kind not in ('cotizacion','pedido','factura') then raise exception 'Tipo inválido'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Agrega al menos un producto'; end if;
  if p_client_id is not null then
    select * into v_client from public.clients where id = p_client_id;
    v_client_name := v_client.name; v_price_kind := v_client.kind;
    v_due := current_date + coalesce(v_client.credit_days, 0);
  end if;
  if p_payment_type = 'credito' and p_client_id is null then
    raise exception 'Para vender a crédito elige un cliente';
  end if;
  select coalesce(sum((x->>'line_total')::numeric), 0) into v_total from jsonb_array_elements(p_items) x;
  v_number := public.next_number(p_kind);

  if p_kind = 'pedido' then
    for i in select * from jsonb_array_elements(p_items) loop
      if (select stock - public.reserved_qty(id) from public.products where id = (i->>'product_id')::uuid) + 0.0005 < (i->>'qty')::numeric then
        raise exception 'No hay suficiente "%" para apartar', i->>'name';
      end if;
    end loop;
  end if;

  v_status := case p_kind when 'cotizacion' then 'abierta' when 'pedido' then 'por_facturar' else 'pendiente' end;
  insert into public.sales_docs (kind, number, status, client_id, client_name, price_kind, payment_type, items, total_usd, rate, note, due_date, created_by)
  values (p_kind, v_number, v_status, p_client_id, v_client_name, v_price_kind, coalesce(p_payment_type, 'contado'), p_items, round(v_total, 2), p_rate, coalesce(p_note, ''), v_due, auth.uid())
  returning id into v_id;

  if p_kind = 'factura' then
    perform public._deduct_stock(p_items, v_number, null);
    v_paid := public._insert_payments(v_id, p_client_id, p_payments, p_rate);
    if p_payment_type <> 'credito' and v_paid + 0.009 < round(v_total, 2) then
      raise exception 'Falta cobrar $ %', round(v_total - v_paid, 2);
    end if;
    update public.sales_docs set paid_usd = round(v_paid, 2),
      status = case when v_paid + 0.009 >= round(v_total, 2) then 'pagada' else 'pendiente' end
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.convert_doc(p_doc_id uuid, p_to_kind text, p_payment_type text, p_payments jsonb, p_rate numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare d record; v_id uuid; v_number text; v_paid numeric := 0; i jsonb; v_due date;
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  select * into d from public.sales_docs where id = p_doc_id for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if d.kind = 'cotizacion' and d.status <> 'abierta' then raise exception 'Esta cotización ya no está abierta'; end if;
  if d.kind = 'pedido' and d.status <> 'por_facturar' then raise exception 'Este pedido ya no está por facturar'; end if;
  if d.kind = 'factura' then raise exception 'Una factura no se puede convertir'; end if;
  if p_to_kind not in ('pedido','factura') or (d.kind = 'pedido' and p_to_kind <> 'factura') then raise exception 'Conversión inválida'; end if;
  if p_payment_type = 'credito' and d.client_id is null then raise exception 'Para vender a crédito elige un cliente'; end if;

  if p_to_kind = 'pedido' then
    for i in select * from jsonb_array_elements(d.items) loop
      if (select stock - public.reserved_qty(id) from public.products where id = (i->>'product_id')::uuid) + 0.0005 < (i->>'qty')::numeric then
        raise exception 'No hay suficiente "%" para apartar', i->>'name';
      end if;
    end loop;
  end if;

  if d.client_id is not null then
    select current_date + coalesce(credit_days, 0) into v_due from public.clients where id = d.client_id;
  end if;
  v_number := public.next_number(p_to_kind);
  insert into public.sales_docs (kind, number, status, client_id, client_name, price_kind, payment_type, items, total_usd, rate, note, source_id, due_date, created_by)
  values (p_to_kind, v_number, case p_to_kind when 'pedido' then 'por_facturar' else 'pendiente' end,
          d.client_id, d.client_name, d.price_kind, coalesce(p_payment_type, d.payment_type), d.items, d.total_usd,
          p_rate, d.note, d.id, v_due, auth.uid())
  returning id into v_id;

  if p_to_kind = 'factura' then
    perform public._deduct_stock(d.items, v_number, case when d.kind = 'pedido' then d.id else null end);
    v_paid := public._insert_payments(v_id, d.client_id, p_payments, p_rate);
    if p_payment_type <> 'credito' and v_paid + 0.009 < d.total_usd then
      raise exception 'Falta cobrar $ %', round(d.total_usd - v_paid, 2);
    end if;
    update public.sales_docs set paid_usd = round(v_paid, 2),
      status = case when v_paid + 0.009 >= d.total_usd then 'pagada' else 'pendiente' end where id = v_id;
  end if;
  update public.sales_docs set status = case d.kind when 'cotizacion' then 'convertida' else 'facturado' end where id = d.id;
  return v_id;
end $$;

create or replace function public.cancel_doc(p_doc_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d record; i jsonb;
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  select * into d from public.sales_docs where id = p_doc_id for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if d.kind = 'factura' then
    if d.status = 'anulada' then return; end if;
    for i in select * from jsonb_array_elements(d.items) loop
      update public.products set stock = stock + (i->>'qty')::numeric where id = (i->>'product_id')::uuid;
      insert into public.stock_movements (product_id, qty, kind, reason, ref, created_by)
      values ((i->>'product_id')::uuid, (i->>'qty')::numeric, 'anulacion', 'Factura anulada', d.number, auth.uid());
    end loop;
    delete from public.payments where doc_id = d.id;
    update public.sales_docs set status = 'anulada', paid_usd = 0 where id = d.id;
  elsif d.kind = 'pedido' then
    if d.status <> 'por_facturar' then raise exception 'Solo se cancelan pedidos por facturar'; end if;
    update public.sales_docs set status = 'cancelado' where id = d.id;
  else
    if d.status <> 'abierta' then raise exception 'Solo se cancelan cotizaciones abiertas'; end if;
    update public.sales_docs set status = 'cancelada' where id = d.id;
  end if;
end $$;

create or replace function public.add_payment(p_doc_id uuid, p_method text, p_amount_usd numeric, p_amount_bs numeric, p_rate numeric, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare d record; v_paid numeric;
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  select * into d from public.sales_docs where id = p_doc_id for update;
  if not found or d.kind <> 'factura' then raise exception 'Factura no encontrada'; end if;
  if d.status <> 'pendiente' then raise exception 'Esta factura no tiene saldo pendiente'; end if;
  if p_amount_usd <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_amount_usd > d.total_usd - d.paid_usd + 0.009 then
    raise exception 'El pago supera lo que se debe ($ %)', round(d.total_usd - d.paid_usd, 2);
  end if;
  insert into public.payments (doc_id, client_id, method, amount_usd, amount_bs, rate, reference, created_by)
  values (d.id, d.client_id, p_method, p_amount_usd, coalesce(p_amount_bs, 0), p_rate, coalesce(p_reference, ''), auth.uid());
  v_paid := d.paid_usd + p_amount_usd;
  update public.sales_docs set paid_usd = round(v_paid, 2),
    status = case when v_paid + 0.009 >= d.total_usd then 'pagada' else 'pendiente' end where id = d.id;
end $$;

create or replace function public.register_purchase(
  p_supplier_id uuid, p_invoice_no text, p_control_no text, p_invoice_date date,
  p_items jsonb, p_payment_type text, p_paid_usd numeric, p_note text, p_rate numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_number text; v_total numeric; i jsonb; v_units numeric; v_unit_cost numeric; v_sname text;
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Agrega al menos un producto'; end if;
  select name into v_sname from public.suppliers where id = p_supplier_id;
  if v_sname is null then raise exception 'Elige un proveedor'; end if;
  select coalesce(sum((x->>'packs')::numeric * (x->>'cost_per_pack')::numeric), 0) into v_total from jsonb_array_elements(p_items) x;
  v_number := public.next_number('compra');
  insert into public.purchases (number, supplier_id, supplier_name, invoice_no, control_no, invoice_date, items, total_usd, paid_usd, payment_type, rate, note, created_by)
  values (v_number, p_supplier_id, v_sname, coalesce(p_invoice_no,''), coalesce(p_control_no,''), coalesce(p_invoice_date, current_date), p_items,
          round(v_total, 2),
          round(case p_payment_type when 'contado' then v_total when 'credito' then 0 else least(coalesce(p_paid_usd,0), v_total) end, 2),
          coalesce(p_payment_type, 'contado'), p_rate, coalesce(p_note, ''), auth.uid())
  returning id into v_id;
  for i in select * from jsonb_array_elements(p_items) loop
    v_units := (i->>'packs')::numeric * greatest((i->>'units_per_pack')::numeric, 0.001);
    v_unit_cost := (i->>'cost_per_pack')::numeric / greatest((i->>'units_per_pack')::numeric, 0.001);
    update public.products set stock = stock + v_units, cost = round(v_unit_cost, 4) where id = (i->>'product_id')::uuid;
    insert into public.stock_movements (product_id, qty, kind, reason, ref, created_by)
    values ((i->>'product_id')::uuid, v_units, 'compra', 'Compra a ' || v_sname, v_number, auth.uid());
  end loop;
  return v_id;
end $$;

create or replace function public.void_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p record; i jsonb; v_units numeric;
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  select * into p from public.purchases where id = p_id for update;
  if not found or p.status = 'anulada' then raise exception 'Compra no encontrada o ya anulada'; end if;
  for i in select * from jsonb_array_elements(p.items) loop
    v_units := (i->>'packs')::numeric * greatest((i->>'units_per_pack')::numeric, 0.001);
    update public.products set stock = stock - v_units where id = (i->>'product_id')::uuid;
    insert into public.stock_movements (product_id, qty, kind, reason, ref, created_by)
    values ((i->>'product_id')::uuid, -v_units, 'anulacion', 'Compra anulada', p.number, auth.uid());
  end loop;
  update public.purchases set status = 'anulada' where id = p.id;
end $$;

create or replace function public.adjust_stock(p_product_id uuid, p_qty numeric, p_kind text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(auth.uid()) then raise exception 'Sin permiso'; end if;
  if p_qty = 0 then raise exception 'La cantidad no puede ser cero'; end if;
  if p_kind not in ('ajuste','merma') then raise exception 'Tipo inválido'; end if;
  update public.products set stock = stock + p_qty where id = p_product_id;
  insert into public.stock_movements (product_id, qty, kind, reason, created_by)
  values (p_product_id, p_qty, p_kind, coalesce(p_reason, ''), auth.uid());
end $$;

revoke execute on function public._insert_payments(uuid, uuid, jsonb, numeric) from public, anon, authenticated;
revoke execute on function public._deduct_stock(jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.next_number(text) from public, anon;
grant execute on function public.create_sale_doc(text, uuid, jsonb, text, text, jsonb, numeric) to authenticated;
grant execute on function public.convert_doc(uuid, text, text, jsonb, numeric) to authenticated;
grant execute on function public.cancel_doc(uuid) to authenticated;
grant execute on function public.add_payment(uuid, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.register_purchase(uuid, text, text, date, jsonb, text, numeric, text, numeric) to authenticated;
grant execute on function public.void_purchase(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text, text) to authenticated;
grant execute on function public.reserved_qty(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

-- ===== Seed =====
insert into public.settings (id, company_name, rif, phone, address, rate, rate_source)
values (1, 'Inversiones El Nonno, C.A.', 'J-00000000-0', '0424-3774030', '', 918.7662, 'bcv');

insert into public.categories (id, name, image_key, sort) values
  ('11111111-0000-0000-0000-000000000001', 'Charcutería', 'charcuteria', 1),
  ('11111111-0000-0000-0000-000000000002', 'Congelados', 'congelados', 2),
  ('11111111-0000-0000-0000-000000000003', 'Envases/Desechables', 'envases', 3),
  ('11111111-0000-0000-0000-000000000004', 'Panadería', 'panaderia', 4),
  ('11111111-0000-0000-0000-000000000005', 'Víveres', 'viveres', 5);

insert into public.products (code, name, category_id, unit, price_detal, price_mayor, cost, stock, min_stock, presentations) values
  ('VIV-0002', 'Azúcar refinada 1 kg', '11111111-0000-0000-0000-000000000005', 'und', 1.25, 1.05, 0.95, 80, 30, '[]'),
  ('ENV-0001', 'Envase de anime 1/2 kg', '11111111-0000-0000-0000-000000000003', 'und', 0.12, 0.09, 0.06, 800, 200, '[{"name":"Paquete","qty":25,"price_detal":2.75,"price_mayor":2.10}]'),
  ('VIV-0001', 'Harina de trigo 1 kg', '11111111-0000-0000-0000-000000000005', 'und', 1.10, 0.95, 0.80, 140, 30, '[{"name":"Bulto","qty":20,"price_detal":22.00,"price_mayor":19.00}]'),
  ('CHA-0001', 'Jamón de pierna', '11111111-0000-0000-0000-000000000001', 'kg', 9.50, 8.00, 6.20, 27.5, 5, '[]'),
  ('VIV-0003', 'Mantequilla 500 g', '11111111-0000-0000-0000-000000000005', 'und', 3.90, 3.40, 2.75, 18, 12, '[]'),
  ('VIV-0004', 'Mayonesa 5 kg', '11111111-0000-0000-0000-000000000005', 'und', 11.00, 9.50, 7.80, 85, 25, '[{"name":"Caja","qty":25,"price_detal":275.00,"price_mayor":237.50}]'),
  ('CHA-0003', 'Mortadela especial', '11111111-0000-0000-0000-000000000001', 'kg', 5.00, 4.20, 3.10, 9.8, 5, '[]'),
  ('PAN-0001', 'Pan campesino', '11111111-0000-0000-0000-000000000004', 'und', 1.00, 0.85, 0.55, 60, 20, '[]'),
  ('PAN-0004', 'Pan canilla', '11111111-0000-0000-0000-000000000004', 'und', 0.30, 0.25, 0.15, 80, 30, '[]'),
  ('PAN-0002', 'Pan de sándwich grande', '11111111-0000-0000-0000-000000000004', 'und', 2.80, 2.40, 1.70, 25, 10, '[]'),
  ('PAN-0003', 'Pan francés', '11111111-0000-0000-0000-000000000004', 'und', 0.18, 0.15, 0.09, 300, 100, '[{"name":"Bolsa","qty":10,"price_detal":1.80,"price_mayor":1.50}]'),
  ('CHA-0004', 'Queso amarillo', '11111111-0000-0000-0000-000000000001', 'kg', 9.00, 7.80, 6.50, 9.75, 4, '[]'),
  ('CHA-0002', 'Queso blanco duro', '11111111-0000-0000-0000-000000000001', 'kg', 6.30, 5.50, 4.40, 4.2, 4, '[]'),
  ('CON-0001', 'Salchicha tipo Viena', '11111111-0000-0000-0000-000000000002', 'kg', 4.30, 3.60, 2.90, 12, 5, '[]'),
  ('CON-0002', 'Helados de fresa', '11111111-0000-0000-0000-000000000002', 'und', 5.00, 3.50, 2.80, 30, 10, '[]'),
  ('ENV-0002', 'Vaso plástico 7 oz', '11111111-0000-0000-0000-000000000003', 'und', 0.05, 0.03, 0.02, 150, 100, '[{"name":"Caja","qty":1000,"price_detal":50.00,"price_mayor":30.00}]');

insert into public.clients (name, rif, phone, address, kind, credit_limit, credit_days) values
  ('Bodega La Esquina', 'J-40123456-1', '0414-1234567', 'Calle 5, sector centro', 'mayor', 300, 30),
  ('Cafetería El Buen Café', 'J-41234567-2', '0424-7654321', 'Av. principal, local 2', 'mayor', 0, 0),
  ('Genesis Ortega', 'V-29782279', '0412-9477795', 'El Palmar', 'detal', 0, 0),
  ('María Pérez', 'V-12345678', '0412-5550000', '', 'detal', 25, 15);

insert into public.suppliers (name, rif, phone) values
  ('Distribuidora Andina', 'J-30111222-3', '0212-5551111'),
  ('Envases del Centro', 'J-30533444-5', '0212-5550000');
