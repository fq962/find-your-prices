-- =============================================================================
-- 0045_map_prive.sql
-- Mapea las categorias de Prive Perfumes (store_categories) al arbol canonico,
-- acotado a esa tienda.
--
-- Los segmentos del menu de Prive son cortes de la misma perfumeria (por
-- publico, formato o rango de precio), asi que todos van a 'fragancias',
-- incluidos los estuches: son sets de perfume. La excepcion es Body Products
-- (cremas, desodorantes, body spray, gel antibacterial), que va a
-- 'cuidado-facial-corporal'.
--
-- 'perfumeria' es la categoria sintetica de la estrategia para lo que solo
-- cuelga de /collections/all.
--
-- Solo toca filas con category_id null: lo corregido desde el panel gana.
-- Idempotente.
-- =============================================================================

with store as (
  select id from find_your_prices.stores where slug = 'prive'
),
pairs (external_id, slug) as (
  values
    ('perfumeria-bebe', 'fragancias'),
    ('perfumeria-ninos', 'fragancias'),
    ('perfumeria-mini', 'fragancias'),
    ('body-products', 'cuidado-facial-corporal'),
    ('gift-sets', 'fragancias'),
    ('perfumeria-arabe', 'fragancias'),
    ('perfumeria-exclusiva', 'fragancias'),
    ('perfumeria-economica', 'fragancias'),
    ('perfumeria-comercial', 'fragancias'),
    ('perfumeria', 'fragancias')
)
update find_your_prices.store_categories sc
set category_id = c.id
from store, pairs p
join find_your_prices.categories c on c.slug = p.slug
where sc.store_id = store.id
  and sc.external_id = p.external_id
  and sc.category_id is null;

-- Reporte: que queda sin mapear en Prive (esperado: ninguna fila).
select sc.external_id, sc.name, sc.product_count
from find_your_prices.store_categories sc
join find_your_prices.stores s on s.id = sc.store_id
where s.slug = 'prive' and sc.category_id is null
order by sc.product_count desc nulls last;
