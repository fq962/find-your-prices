-- =============================================================================
-- 0038_map_metromedia.sql
-- Mapea las categorias de Metromedia (store_categories) al arbol canonico,
-- acotado a esa tienda.
--
-- Por que aparte de 0036. El mapeo general va por nombre y sin tienda, y los
-- 52 generos de Metromedia tienen nombres genericos ("Cocina", "Arte",
-- "Salud", "Musica", "Fiction") que en otras tiendas son utensilios, pinturas
-- o instrumentos. Mapearlos por nombre rompería esas tiendas; aca se mapean
-- solo donde store.slug = 'metromedia'. Lo mismo con "Entretenimiento"
-- (puzzles y juegos en Metromedia, cine y musica en otras) y "Accesorios",
-- que aqui es un cajon mixto y se deja sin mapear a proposito.
--
-- Las raices con nombre propio (Comics, Biblia, Libros en Español, Libros
-- para colorear, Calendarios...) van por 0036 (mapping-4.tsv); si 0036 ya
-- corrio antes de 0037, volver a ejecutarlo: es idempotente.
--
-- Reglas:
--   - Todo genero (nivel 2 del arbol de la tienda: hijos de Libros en
--     Español e Ingles) -> libros.
--   - Entretenimiento -> juegos-de-mesa-rompecabezas.
--
-- Solo toca filas con category_id null: lo corregido desde el panel gana.
-- Idempotente.
-- =============================================================================

with store as (
  select id from find_your_prices.stores where slug = 'metromedia'
),
libros as (
  select id from find_your_prices.categories where slug = 'libros'
),
juegos as (
  select id from find_your_prices.categories where slug = 'juegos-de-mesa-rompecabezas'
)
update find_your_prices.store_categories sc
set category_id = case
  when sc.external_parent_id is not null then (select id from libros)
  when find_your_prices.normalize_text(sc.name) = 'entretenimiento' then (select id from juegos)
end
from store
where sc.store_id = store.id
  and sc.category_id is null
  and (
    sc.external_parent_id is not null
    or find_your_prices.normalize_text(sc.name) = 'entretenimiento'
  );

-- Reporte: que quedo sin mapear en Metromedia (esperado: solo "Accesorios").
select sc.name, sc.external_id
from find_your_prices.store_categories sc
join find_your_prices.stores s on s.id = sc.store_id
where s.slug = 'metromedia' and sc.category_id is null and sc.is_active
order by sc.name;
