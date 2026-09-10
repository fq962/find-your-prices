-- =============================================================================
-- 0023_schedule_anchor.sql
-- Ancla de programacion: que "todos los lunes a las 08:00" siga siendo eso
-- dentro de seis meses.
--
-- EL PROBLEMA
--
-- Hasta ahora el runner reprogramaba asi:
--
--   next_run_at = now() + frequency_minutes
--
-- Es correcto para "cada 6 horas, mas o menos", y esta MAL para una agenda de
-- calendario. La corrida empieza a las 08:00:04 y tarda 90 s, asi que la
-- proxima queda en lunes 08:01:34. El cron dispara el lunes siguiente a las
-- 08:00:02 -> todavia no vence -> se salta. Corre a las 20:00, en la ventana de
-- otra tienda, y desde ahi la agenda entera se desliza. Cada corrida empuja la
-- siguiente un poco mas tarde: en un mes, "los lunes a las 8" cae en cualquier
-- lado.
--
-- LA SOLUCION
--
-- Guardar el origen de la rejilla, no solo el proximo punto. Con un ancla, todo
-- horario valido cumple:
--
--   next_run_at = schedule_anchor_at + k * frequency_minutes   (k entero)
--
-- y el runner, al terminar bien, salta al primer punto de esa rejilla que sea
-- posterior a ahora. La duracion de la corrida deja de contar, y un target que
-- se atraso por fallos vuelve solo a su horario en cuanto tiene exito (el
-- backoff de reintento si sale de la rejilla a proposito: un sitio caido se
-- reintenta pronto, no el lunes que viene).
--
-- Por que un ancla y no `cron_expression` (que ya existe en la tabla):
-- el cron estandar no sabe decir "cada 3 dias". `0 3 */3 * *` reinicia el
-- conteo cada mes y produce saltos de 1 a 3 dias entre el 31 y el 1. Con ancla
-- + intervalo, "cada 3 dias a las 03:00" y "cada lunes a las 08:00" (intervalo
-- de 7 dias) son el mismo mecanismo y ninguno de los dos deriva. La columna
-- cron_expression queda como estaba, sin uso.
--
-- Idempotente: se puede volver a ejecutar sin romper nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La columna.
-- -----------------------------------------------------------------------------
alter table find_your_prices.scrape_targets
  add column if not exists schedule_anchor_at timestamptz;

comment on column find_your_prices.scrape_targets.schedule_anchor_at is
  'Origen de la rejilla horaria. Todo next_run_at sano es schedule_anchor_at + k*frequency_minutes. '
  'Sirve para que la agenda no derive por la duracion de cada corrida. Null = comportamiento viejo '
  '(next_run_at = now() + frequency).';

-- Backfill: la proxima corrida ya programada es un punto valido de la rejilla,
-- asi que sirve de origen. Los targets existentes conservan su horario actual.
update find_your_prices.scrape_targets
set schedule_anchor_at = next_run_at
where schedule_anchor_at is null;

-- -----------------------------------------------------------------------------
-- 2. La vista del panel necesita los campos que ahora se pueden editar.
--
-- `create or replace view` exige que las columnas existentes no cambien de
-- nombre, tipo ni orden: las nuevas van al final.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_scrape_target_health as
select
  t.id                as target_id,
  t.name              as target_name,
  t.kind,
  t.url,
  t.is_active,
  t.frequency_minutes,
  t.next_run_at,
  t.last_run_at,
  t.last_success_at,
  t.last_status,
  t.consecutive_failures,
  t.paused_reason,
  s.id                as store_id,
  s.slug              as store_slug,
  s.name              as store_name,
  coalesce(t.strategy_key, s.strategy_key) as strategy_key,
  r.id                as last_run_id,
  r.duration_ms       as last_duration_ms,
  r.items_found       as last_items_found,
  r.items_new         as last_items_new,
  r.items_updated     as last_items_updated,
  r.price_changes     as last_price_changes,
  r.error_message     as last_error_message,
  (select count(*) from find_your_prices.store_products sp
    where sp.store_id = s.id and sp.is_active) as store_active_products,
  -- Nuevas, para el formulario de edicion del panel.
  t.schedule_anchor_at,
  t.priority,
  t.max_pages,
  t.config,
  t.notes
from find_your_prices.scrape_targets t
join find_your_prices.stores s on s.id = t.store_id
left join lateral (
  select * from find_your_prices.scrape_runs sr
  where sr.target_id = t.id
  order by sr.started_at desc
  limit 1
) r on true;

comment on view find_your_prices.v_scrape_target_health is
  'Estado, ultimo resultado y parametros editables de cada target. Consulta principal del panel.';

-- -----------------------------------------------------------------------------
-- 3. security_invoker: sin esto la vista se evaluaria con los permisos de su
-- dueño y saltaria el RLS de las tablas que consulta. `create or replace view`
-- conserva las opciones existentes, pero se repite por si acaso.
-- -----------------------------------------------------------------------------
do $$
begin
  if current_setting('server_version_num')::integer >= 150000 then
    execute 'alter view find_your_prices.v_scrape_target_health set (security_invoker = on)';
  end if;
end $$;
