-- =============================================================================
-- 0010_grants_and_rls.sql
-- Permisos y seguridad a nivel de fila.
--
-- Modelo: TODA escritura pasa por el servidor de Next usando la service key
-- (que ignora RLS). Las claves publicas solo pueden leer el catalogo. El panel
-- de administracion queda protegido a nivel de aplicacion (mas adelante OAuth),
-- nunca exponiendo las tablas de scraping al navegador.
--
-- IMPORTANTE: para que PostgREST vea este esquema hay que agregarlo en
-- Supabase -> Settings -> API -> Exposed schemas: "public, find_your_prices".
-- =============================================================================

grant usage on schema find_your_prices to anon, authenticated, service_role;

-- Lectura publica del catalogo.
grant select on
  find_your_prices.stores,
  find_your_prices.brands,
  find_your_prices.categories,
  find_your_prices.store_categories,
  find_your_prices.products,
  find_your_prices.store_products,
  find_your_prices.store_product_images,
  find_your_prices.store_product_variants,
  find_your_prices.price_history,
  find_your_prices.v_store_products_current,
  find_your_prices.v_recent_price_drops,
  find_your_prices.v_product_price_comparison
to anon, authenticated;

-- El backend hace todo lo demas.
grant all on all tables in schema find_your_prices to service_role;
grant all on all sequences in schema find_your_prices to service_role;
grant execute on all functions in schema find_your_prices to service_role;

alter default privileges in schema find_your_prices
  grant all on tables to service_role;
alter default privileges in schema find_your_prices
  grant all on sequences to service_role;

-- -----------------------------------------------------------------------------
-- RLS. Se habilita en todas las tablas: sin politica explicita, anon y
-- authenticated no ven nada; service_role no pasa por RLS.
-- -----------------------------------------------------------------------------
alter table find_your_prices.stores                   enable row level security;
alter table find_your_prices.scrape_targets           enable row level security;
alter table find_your_prices.scrape_runs              enable row level security;
alter table find_your_prices.brands                   enable row level security;
alter table find_your_prices.categories               enable row level security;
alter table find_your_prices.store_categories         enable row level security;
alter table find_your_prices.products                 enable row level security;
alter table find_your_prices.store_products           enable row level security;
alter table find_your_prices.store_product_images     enable row level security;
alter table find_your_prices.store_product_variants   enable row level security;
alter table find_your_prices.price_history            enable row level security;
alter table find_your_prices.product_match_candidates enable row level security;

-- Politicas de solo lectura para el catalogo publico.
do $$
declare
  t text;
begin
  foreach t in array array[
    'stores', 'brands', 'categories', 'store_categories', 'products',
    'store_products', 'store_product_images', 'store_product_variants', 'price_history'
  ]
  loop
    execute format('drop policy if exists %I on find_your_prices.%I', t || '_public_read', t);
    execute format(
      'create policy %I on find_your_prices.%I for select to anon, authenticated using (true)',
      t || '_public_read', t
    );
  end loop;
end
$$;

-- scrape_targets, scrape_runs y product_match_candidates quedan a proposito sin
-- politica: solo el backend con service key los toca.
