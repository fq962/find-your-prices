-- =============================================================================
-- 0043_map_paperdepot.sql
-- Mapea las categorias de Paper Depot (store_categories) al arbol canonico,
-- acotado a esa tienda.
--
-- Por que aparte de 0036. El mapeo general va por nombre y sin tienda, y los
-- nombres de Paper Depot chocan con los de otras tiendas: "Pizarras",
-- "Tableros", "Navajas", "Sellos", "Hules", "Rollos" o "Cristales" significan
-- otra cosa en una ferreteria. Se mapea por el id de grupo de la tienda y solo
-- donde store.slug = 'paperdepot'.
--
-- Criterios de las decisiones menos obvias:
--   - Papeles Especializados (cartulinas, foami, papel china, fieltro) ->
--     'arte-manualidades': es material de manualidad, no papel de impresion.
--     El papel bond si va a 'cuadernos-libretas-hojas' y el de regalo a
--     'fiestas'.
--   - Articulos Personalizados (tazas, cojines, sombrillas, portavasos) ->
--     'articulos-promocionales-e-impulso'; los rompecabezas, a juguetes.
--   - Centro de Copiado: encuadernados -> 'archivo' (pastas y espirales);
--     laminados -> 'utiles-escolares-oficina' (micas y laminadoras).
--   - Impresion Digital entera -> 'rotulacion-y-exhibicion'.
--   - Folders, archivadores, cajas, revisteros y libros contables ->
--     'archivo'; el resto de la papeleria de oficina ->
--     'utiles-escolares-oficina'.
--
-- Las 8 categorias del menu se guardan con external_id 'cat-<nombre>': la
-- tienda no les da id propio, solo el data-cat-id del menu, y el nombre es lo
-- unico estable entre corridas.
--
-- Solo toca filas con category_id null: lo corregido desde el panel gana.
-- Idempotente.
-- =============================================================================

with store as (
  select id from find_your_prices.stores where slug = 'paperdepot'
),
pairs (external_id, slug) as (
  values
    ('108', 'archivo'),
    ('110', 'utiles-escolares-oficina'),
    ('126', 'bolsos-mochilas-y-billeteras'),
    ('127', 'utiles-escolares-oficina'),
    ('131', 'utiles-escolares-oficina'),
    ('133', 'utiles-escolares-oficina'),
    ('135', 'utiles-escolares-oficina'),
    ('140', 'articulos-promocionales-e-impulso'),
    ('155', 'telefonos-celulares'),
    ('159', 'arte-manualidades'),
    ('162', 'cuadernos-libretas-hojas'),
    ('166', 'escritura-correccion'),
    ('168', 'arte-manualidades'),
    ('176', 'escritura-correccion'),
    ('178', 'cuadernos-libretas-hojas'),
    ('180', 'utiles-escolares-oficina'),
    ('183', 'archivo'),
    ('184', 'arte-manualidades'),
    ('186', 'utiles-escolares-oficina'),
    ('187', 'utiles-escolares-oficina'),
    ('188', 'utiles-escolares-oficina'),
    ('190', 'escritura-correccion'),
    ('191', 'almacenamiento-datos'),
    ('193', 'utiles-escolares-oficina'),
    ('196', 'utiles-escolares-oficina'),
    ('197', 'rotulacion-y-exhibicion'),
    ('202', 'utiles-escolares-oficina'),
    ('205', 'utiles-escolares-oficina'),
    ('207', 'utiles-escolares-oficina'),
    ('213', 'archivo'),
    ('215', 'archivo'),
    ('216', 'utiles-escolares-oficina'),
    ('218', 'archivo'),
    ('219', 'archivo'),
    ('252', 'rotulacion-y-exhibicion'),
    ('470', 'archivo'),
    ('474', 'escritura-correccion'),
    ('475', 'cuadernos-libretas-hojas'),
    ('476', 'arte-manualidades'),
    ('479', 'fiestas'),
    ('480', 'arte-manualidades'),
    ('483', 'arte-manualidades'),
    ('486', 'arte-manualidades'),
    ('487', 'arte-manualidades'),
    ('490', 'arte-manualidades'),
    ('491', 'escritura-correccion'),
    ('492', 'arte-manualidades'),
    ('493', 'utiles-escolares-oficina'),
    ('494', 'rotulacion-y-exhibicion'),
    ('502', 'rotulacion-y-exhibicion'),
    ('509', 'articulos-promocionales-e-impulso'),
    ('511', 'juegos-de-mesa-rompecabezas'),
    ('512', 'articulos-promocionales-e-impulso'),
    ('514', 'articulos-promocionales-e-impulso'),
    ('515', 'articulos-promocionales-e-impulso'),
    ('517', 'articulos-promocionales-e-impulso'),
    ('519', 'impresoras'),
    ('561', 'perifericos'),
    ('613', 'utiles-escolares-oficina'),
    ('614', 'utiles-escolares-oficina'),
    ('616', 'juguetes-educativos'),
    ('617', 'utiles-escolares-oficina'),
    ('766', 'relojes-y-joyeria'),
    ('cat-Articulos Personalizados', 'articulos-promocionales-e-impulso'),
    ('cat-Centro de Copiado', 'publicidad-y-comercio'),
    ('cat-Electrónica', 'tecnologia'),
    ('cat-Escolares y Arquitectura', 'libreria-y-papelera'),
    ('cat-Impresion Digital', 'rotulacion-y-exhibicion'),
    ('cat-Oficina', 'utiles-escolares-oficina'),
    ('cat-Papeles Especializados', 'arte-manualidades'),
    ('cat-Relojes', 'relojes-y-joyeria')
)
update find_your_prices.store_categories sc
set category_id = c.id
from store, pairs p
join find_your_prices.categories c on c.slug = p.slug
where sc.store_id = store.id
  and sc.external_id = p.external_id
  and sc.category_id is null;

-- Reporte: que queda sin mapear en Paper Depot (esperado: ninguna fila).
select sc.external_id, sc.name, sc.product_count
from find_your_prices.store_categories sc
join find_your_prices.stores s on s.id = sc.store_id
where s.slug = 'paperdepot' and sc.category_id is null
order by sc.product_count desc nulls last;
