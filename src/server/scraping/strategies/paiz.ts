import type { NormalizedProduct, ScrapeStrategy } from '../types';
import { createVtexCatalogStrategy, mapVtexProduct, type VtexProduct } from './walmarthn';

/**
 * Estrategia de scraping para Paiz Honduras (https://www.paiz.com.hn).
 *
 * ---------------------------------------------------------------------------
 * Por que reusa la de Walmart HN
 * ---------------------------------------------------------------------------
 * Paiz es la otra bandera de Walmart Centroamerica en Honduras y corre sobre
 * **la misma cuenta VTEX** que walmart.com.hn: las imagenes salen de
 * `walmarthn.vteximg.com.br`, el robots.txt de Paiz enlaza al sitemap de
 * Walmart, y la Catalog System API responde con el mismo esquema, los mismos
 * ids de categoria (`/1/21/160/` = Abarrotes > Harinas > Harina de Trigo y
 * Maiz) y los mismos topes. Por eso esta estrategia es una configuracion de
 * `createVtexCatalogStrategy` y no una copia: cualquier arreglo en el barrido
 * de Walmart aplica aca sin duplicarlo.
 *
 * Endpoint usado:
 *   GET https://www.paiz.com.hn/api/catalog_system/pub/products/search/{ruta}?_from=N&_to=M&O=OrderByNameASC
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-14)
 * ---------------------------------------------------------------------------
 *
 *   - El html de una categoria pesa 280 KB y no menciona `vtex` ni `__STATE__`
 *     (Paiz usa otro front que Walmart), pero la API responde 206 al bot en la
 *     primera peticion. No hace falta parsear nada.
 *
 *   - Mismos topes que Walmart: ventana de 50 (`_to=50` responde 400) y
 *     `_from` maximo 2500 ("Parameter _from can't be greater than 2500").
 *     Abarrotes declara 2498 y cabe justo en una consulta; Limpieza 1086;
 *     Lacteos 486. El reparto por subcategorias queda activo por si crecen.
 *
 *   - **`raw` NO se guarda**, por espacio en la base. La ingesta deja `{}`
 *     porque la columna es `not null default '{}'`; dejar NULL literal
 *     pediria una migracion, y agregar una tienda no toca la base. Todo lo que
 *     se necesita para comparar precios ya esta en columnas propias (EAN al
 *     100% de la muestra, precio, lista, ficha en `specs`).
 *
 *   - Los `link` apuntan a `www.paiz.com.hn` (50/50 en la muestra), asi que
 *     la url publica no se reconstruye.
 *
 *   - **Rutas con tilde.** El menu enlaza a `/l%C3%A1cteos`; la API acepta
 *     esa forma codificada, rechaza `lácteos` crudo con 400 y el sitemap la
 *     publica como `lacteos`. `categoryPathFromUrl` la normaliza a `lacteos`
 *     para que el reparto por subcategorias encuentre a sus hijas.
 *
 *   - El sitemap `sitemap/category-0.xml` publica 679 rutas y acepta al bot.
 *     Raices y articulos declarados (2026-09-14): abarrotes 2498, higiene-y-
 *     belleza 2089, limpieza 1086, articulos-para-el-hogar 730, jugos-y-bebidas
 *     586, lacteos 486, farmacia 433, cervezas-vinos-y-licores 405, carnes-
 *     embutidos-y-mariscos 378, bebes-y-ninos 366, panaderia-y-tortilleria 289,
 *     mascota 210, alimentos-congelados 193, frutas-y-verduras 184, juguetes
 *     178, autos 68, deportes 19, electronica 5. Ninguna pasa el tope de 2550,
 *     asi que hoy no hace falta repartir; `partitionOversized` queda activo
 *     por si crecen. `rebajas` (el primer item del menu) no es una categoria:
 *     la API responde 0; las rebajas ya salen en `list_price` de cada articulo.
 *
 *   - robots.txt identico al de Walmart: permite estas rutas.
 *
 *   - **Primera corrida de Abarrotes (2498 nuevos): el lote 2000-2250 fallo con
 *     `canceling statement due to statement timeout` en la ingesta.** No es la
 *     estrategia: es Postgres tardando en insertar 250 articulos nuevos con
 *     galeria y ficha. Los lotes anteriores quedan, y al reintentar entran como
 *     "sin cambios" y el resto termina en 67 s. Si vuelve a pasar en un catalogo
 *     nuevo, correr el target dos veces; no hace falta tocar nada.
 */

const DEFAULTS = {
  apiBaseUrl: 'https://www.paiz.com.hn/api/catalog_system/pub',
  webBaseUrl: 'https://www.paiz.com.hn',
} as const;

/** Mapeador de Paiz: el de VTEX sin `raw`. Exportado para probarlo sin red. */
export function mapPaizProduct(product: VtexProduct, currency: string): NormalizedProduct | null {
  return mapVtexProduct(product, currency, { keepRaw: false });
}

export const paizStrategy: ScrapeStrategy = createVtexCatalogStrategy({
  key: 'paiz',
  label: 'Paiz Honduras (VTEX Catalog API, sin raw)',
  apiBaseUrl: DEFAULTS.apiBaseUrl,
  webBaseUrl: DEFAULTS.webBaseUrl,
  keepRaw: false,
});
