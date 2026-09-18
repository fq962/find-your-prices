-- =============================================================================
-- 0039_protect_categories.sql
-- Candado contra borrados accidentales en categories y category_content.
--
-- Por que. El arbol de categorias se perdio entero con un delete desde el
-- editor SQL (y con el, por cascada, todo category_content). Reconstruirlo
-- costo 0035/0036 y volver a colgar imagenes y contenido SEO. Esto no tiene
-- que poder pasar por accidente otra vez.
--
-- Como. Un trigger BEFORE DELETE en las dos tablas (y BEFORE TRUNCATE) que
-- aborta salvo que la sesion haya abierto el candado con
--
--     select set_config('find_your_prices.allow_delete', 'on', true);
--
-- El tercer parametro (true) lo hace local a la transaccion: al terminar,
-- el candado vuelve a cerrarse solo. Para borrar a proposito desde el editor:
--
--     begin;
--     select set_config('find_your_prices.allow_delete', 'on', true);
--     delete from find_your_prices.categories where slug = 'lo-que-sea';
--     commit;
--
-- El panel borra a traves de find_your_prices.delete_category(uuid), que
-- abre el candado dentro de su propia transaccion, asi que "Eliminar" en
-- /admin/categorias sigue funcionando con sus mismas validaciones (sin
-- hijas, sin categorias de tienda relacionadas). La cascada de
-- category_content pasa porque corre en la misma transaccion.
--
-- Idempotente: se puede volver a ejecutar.
-- =============================================================================

create or replace function find_your_prices.guard_category_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('find_your_prices.allow_delete', true), '') <> 'on' then
    raise exception 'Borrado bloqueado en %.%: abrí el candado con set_config(''find_your_prices.allow_delete'', ''on'', true) dentro de la transacción, o borrá desde el panel.',
      tg_table_schema, tg_table_name
      using errcode = 'insufficient_privilege',
            hint = 'Ver src/db/migrations/0039_protect_categories.sql';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return null;
end;
$$;

comment on function find_your_prices.guard_category_delete() is
  'Aborta DELETE/TRUNCATE salvo que la transacción haya puesto find_your_prices.allow_delete = on (ver 0039).';

drop trigger if exists categories_guard_delete on find_your_prices.categories;
create trigger categories_guard_delete
  before delete on find_your_prices.categories
  for each row execute function find_your_prices.guard_category_delete();

drop trigger if exists categories_guard_truncate on find_your_prices.categories;
create trigger categories_guard_truncate
  before truncate on find_your_prices.categories
  for each statement execute function find_your_prices.guard_category_delete();

drop trigger if exists category_content_guard_delete on find_your_prices.category_content;
create trigger category_content_guard_delete
  before delete on find_your_prices.category_content
  for each row execute function find_your_prices.guard_category_delete();

drop trigger if exists category_content_guard_truncate on find_your_prices.category_content;
create trigger category_content_guard_truncate
  before truncate on find_your_prices.category_content
  for each statement execute function find_your_prices.guard_category_delete();

-- Puerta del panel: borra una categoria abriendo el candado solo en esta
-- transaccion. Repite las validaciones del servicio por si alguien la llama
-- directo.
create or replace function find_your_prices.delete_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = find_your_prices, public
as $$
declare
  v_name text;
  v_children int;
  v_mapped int;
begin
  select name into v_name from find_your_prices.categories where id = p_id;
  if v_name is null then
    raise exception 'No existe la categoría %', p_id using errcode = 'no_data_found';
  end if;
  select count(*) into v_children from find_your_prices.categories where parent_id = p_id;
  if v_children > 0 then
    raise exception '"%" tiene % subcategorías. Movelas o borralas primero.', v_name, v_children
      using errcode = 'check_violation';
  end if;
  select count(*) into v_mapped from find_your_prices.store_categories where category_id = p_id;
  if v_mapped > 0 then
    raise exception '"%" tiene % categorías de tienda relacionadas. Reasignalas primero.', v_name, v_mapped
      using errcode = 'check_violation';
  end if;

  perform set_config('find_your_prices.allow_delete', 'on', true);
  delete from find_your_prices.categories where id = p_id;
end;
$$;

comment on function find_your_prices.delete_category(uuid) is
  'Borrado deliberado de una hoja sin mapeos desde el panel; abre el candado de 0039 solo en su transacción.';

revoke all on function find_your_prices.delete_category(uuid) from public, anon, authenticated;
grant execute on function find_your_prices.delete_category(uuid) to service_role;
