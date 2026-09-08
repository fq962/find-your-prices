-- =============================================================================
-- 0012_rls_hardening.sql
-- Row Level Security en TODAS las tablas del esquema, sin excepciones.
--
-- La migracion 0010 ya activaba RLS tabla por tabla. Esta la reemplaza con una
-- version que recorre el catalogo de Postgres, de modo que:
--
--   * ninguna tabla puede quedarse fuera por olvido;
--   * volver a ejecutarla despues de agregar tablas nuevas las protege sin
--     tener que editar la lista a mano;
--   * queda un reporte al final que dice, tabla por tabla, si RLS quedo activa
--     y cuantas politicas tiene.
--
-- Cierra ademas dos huecos que RLS por si sola NO tapa:
--
--   1. LAS VISTAS. En Postgres una vista se ejecuta por defecto con los
--      permisos de su dueño, no de quien consulta. Es decir: una vista sobre
--      una tabla con RLS **salta ese RLS**. Como v_scrape_target_health lee
--      scrape_targets y scrape_runs, cualquiera con la llave publica podia leer
--      la configuracion del scraper a traves de la vista aunque las tablas
--      estuvieran protegidas. Se corrige con security_invoker.
--
--   2. EL search_path DE LAS FUNCIONES. Una funcion sin search_path fijo puede
--      ser inducida a resolver nombres contra un esquema controlado por el
--      atacante. Se fija explicitamente en todas.
--
-- Es idempotente: se puede correr las veces que haga falta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS activa en toda tabla del esquema.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'find_your_prices'
      and c.relkind = 'r'          -- solo tablas ordinarias
      and not c.relrowsecurity     -- las que aun no la tienen
  loop
    execute format('alter table find_your_prices.%I enable row level security', r.relname);
    raise notice 'RLS activada en %', r.relname;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Catalogo publico: lectura para cualquiera, escritura para nadie.
--
-- Estas tablas son el producto: precios y fichas que el sitio muestra sin
-- login. La politica es SELECT y solo SELECT; no hay policy de insert, update
-- ni delete, asi que anon y authenticated no pueden escribir aunque alguien
-- les otorgara el grant por error.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  public_tables constant text[] := array[
    'stores',
    'brands',
    'categories',
    'store_categories',
    'products',
    'store_products',
    'store_product_images',
    'store_product_variants',
    'price_history'
  ];
begin
  foreach t in array public_tables loop
    execute format('drop policy if exists %I on find_your_prices.%I', t || '_public_read', t);
    execute format(
      'create policy %I on find_your_prices.%I for select to anon, authenticated using (true)',
      t || '_public_read', t
    );

    -- El grant acompaña a la politica: PostgREST necesita ambos.
    execute format('grant select on find_your_prices.%I to anon, authenticated', t);
    execute format('revoke insert, update, delete on find_your_prices.%I from anon, authenticated', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Tablas operativas: cerradas por completo a las llaves publicas.
--
-- scrape_targets guarda como se rastrea cada sitio; scrape_runs, la bitacora;
-- product_match_candidates, decisiones internas de emparejamiento. Nada de eso
-- es publico. Se quedan SIN politica a proposito: con RLS activa y sin policy,
-- el resultado para anon y authenticated es "cero filas" siempre. Ademas se
-- revocan los grants, para que ni siquiera lleguen a evaluar RLS.
--
-- service_role no pasa por RLS (tiene BYPASSRLS), asi que el backend sigue
-- operando con normalidad.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  private_tables constant text[] := array[
    'scrape_targets',
    'scrape_runs',
    'product_match_candidates'
  ];
begin
  foreach t in array private_tables loop
    -- Por si una corrida anterior dejo una politica permisiva.
    execute format('drop policy if exists %I on find_your_prices.%I', t || '_public_read', t);
    execute format('revoke all on find_your_prices.%I from anon, authenticated', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Vistas con security_invoker.
--
-- Con esto la vista se evalua con los permisos y las politicas RLS de QUIEN
-- consulta, no de su dueño. Consecuencias buscadas:
--
--   * v_store_products_current, v_recent_price_drops y
--     v_product_price_comparison siguen siendo legibles por anon, porque las
--     tablas que consultan tienen politica de lectura publica.
--   * v_scrape_target_health deja de ser legible por anon, porque
--     scrape_targets y scrape_runs no lo son. El panel la lee con service_role,
--     asi que no se ve afectado.
--
-- security_invoker existe desde Postgres 15. Se comprueba la version para que
-- la migracion no reviente en una instancia mas vieja.
-- -----------------------------------------------------------------------------
do $$
declare
  v record;
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise warning
      'Postgres % no soporta security_invoker en vistas. Las vistas seguiran ejecutandose con los permisos de su dueño: revocar el select a anon en v_scrape_target_health manualmente.',
      current_setting('server_version');
    revoke all on find_your_prices.v_scrape_target_health from anon, authenticated;
    return;
  end if;

  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'find_your_prices'
      and c.relkind = 'v'
  loop
    execute format('alter view find_your_prices.%I set (security_invoker = true)', v.relname);
  end loop;
end
$$;

-- Las vistas del catalogo publico si se exponen; la de salud del scraper no.
grant select on
  find_your_prices.v_store_products_current,
  find_your_prices.v_recent_price_drops,
  find_your_prices.v_product_price_comparison
to anon, authenticated;

revoke all on find_your_prices.v_scrape_target_health from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. search_path fijo en las funciones del esquema.
--
-- Sin esto, una funcion resuelve los nombres sin cualificar contra el
-- search_path de quien la llama, que es manipulable. Con el search_path
-- clavado, siempre resuelve contra los esquemas correctos.
-- -----------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'find_your_prices'
  loop
    execute format(
      'alter function %s set search_path = find_your_prices, public, pg_temp',
      f.signature
    );
  end loop;
end
$$;

-- Las funciones de ingesta solo las invoca el backend.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'find_your_prices'
      and p.proname in ('ingest_store_products', 'mark_delisted_products')
  loop
    execute format('revoke all on function %s from anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Reporte final.
--
-- El resultado de esta consulta es la prueba de que todo quedo protegido:
-- rls_activa debe ser true en TODAS las filas. Las tablas publicas muestran
-- 1 politica (la de lectura); las operativas, 0 -> nadie ve nada.
-- -----------------------------------------------------------------------------
select
  c.relname                                            as tabla,
  c.relrowsecurity                                     as rls_activa,
  (select count(*) from pg_policies p
    where p.schemaname = 'find_your_prices'
      and p.tablename = c.relname)                     as politicas,
  case
    when has_table_privilege('anon', c.oid, 'SELECT') then 'lectura publica'
    else 'privada'
  end                                                  as acceso_anon
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'find_your_prices'
  and c.relkind = 'r'
order by c.relrowsecurity, c.relname;
