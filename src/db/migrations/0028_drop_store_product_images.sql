-- =============================================================================
-- 0028_drop_store_product_images.sql
-- Cierre de 0026/0027. Correr SOLO cuando 0027 devuelva "UPDATE 0" y la app
-- que lee store_products.images ya este desplegada (la version anterior hace
-- join a esta tabla en la ficha de producto y fallaria).
-- =============================================================================

do $$
declare
  v_pending integer;
begin
  if to_regclass('find_your_prices.store_product_images') is null then
    return;  -- ya se hizo
  end if;

  select count(*) into v_pending
  from find_your_prices.store_products sp
  where sp.images = '[]'::jsonb
    and exists (select 1 from find_your_prices.store_product_images i
                where i.store_product_id = sp.id);

  if v_pending > 0 then
    raise exception 'Faltan % productos por migrar su galeria: vuelve a correr 0027.', v_pending;
  end if;

  drop table find_your_prices.store_product_images;
end
$$;

-- Variantes: raw tampoco se guarda desde 0026. Son ~3k filas, cabe en una pasada.
update find_your_prices.store_product_variants
set raw = '{}'::jsonb
where raw is null or raw <> '{}'::jsonb;

-- Ahora si, fuera de horario, para devolver el espacio al sistema (bloquea la
-- tabla unos minutos; NO va dentro de una transaccion con lo de arriba):
--   vacuum full find_your_prices.store_products;
--   vacuum full find_your_prices.store_product_variants;
