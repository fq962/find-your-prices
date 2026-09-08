# Base de datos — Find Your Prices

Documentación del esquema `find_your_prices` en Supabase (Postgres). Escrita para
que la lea tanto una persona como un agente: cada tabla explica **qué guarda**,
**por qué existe** y **cómo se relaciona** con el resto.

---

## 1. Cómo aplicar las migraciones

Los archivos de `src/db/migrations/` se ejecutan **en orden numérico** desde el
SQL Editor de Supabase. Son idempotentes: volver a correrlos no rompe nada.

| # | Archivo | Qué hace |
|---|---------|----------|
| 0001 | `0001_schema_init.sql` | Crea el esquema, extensiones (`pgcrypto`, `unaccent`, `pg_trgm`) y las funciones de normalización de texto. |
| 0002 | `0002_enums.sql` | Tipos enumerados compartidos. |
| 0003 | `0003_stores_and_targets.sql` | `stores` y `scrape_targets`. |
| 0004 | `0004_catalog.sql` | `brands`, `categories`, `store_categories`, `products`. |
| 0005 | `0005_store_products.sql` | `store_products`, imágenes y variantes. |
| 0006 | `0006_runs_and_price_history.sql` | `scrape_runs` y `price_history`. |
| 0007 | `0007_matching.sql` | `product_match_candidates`. |
| 0008 | `0008_ingest_function.sql` | Funciones de ingesta y de bajas. |
| 0009 | `0009_views.sql` | Vistas de lectura. |
| 0010 | `0010_grants_and_rls.sql` | Permisos y RLS. |
| 0011 | `0011_seed_diunsa.sql` | Alta de Diunsa y sus dos targets iniciales. |
| 0012 | `0012_rls_hardening.sql` | **RLS en todas las tablas**, `security_invoker` en las vistas y `search_path` fijo en las funciones. Deja un reporte al final. |

> **Paso obligatorio después de 0010:** en Supabase, `Settings → API → Exposed
> schemas`, agregar `find_your_prices` junto a `public`. Sin eso PostgREST
> devuelve 404 en todas las tablas y el panel muestra el error explicándolo.

---

## 2. Mapa mental

```
                    ┌──────────┐
                    │  stores  │  un comercio (Diunsa, Ladylee, ...)
                    └────┬─────┘
                         │
          ┌──────────────┼────────────────┬────────────────────┐
          │              │                │                    │
  ┌───────▼───────┐ ┌────▼───────────┐ ┌──▼──────────────┐     │
  │ scrape_targets│ │store_categories│ │ store_products  │◄────┘
  │ qué se rastrea│ │ árbol crudo    │ │ la oferta viva  │
  └───────┬───────┘ └────┬───────────┘ └──┬──────────┬───┘
          │              │                │          │
  ┌───────▼───────┐      │        ┌───────▼──────┐ ┌─▼────────────────┐
  │  scrape_runs  │      │        │price_history │ │ imágenes /       │
  │  bitácora     │      │        │ serie de     │ │ variantes        │
  └───────────────┘      │        │ precios      │ └──────────────────┘
                         │        └──────────────┘
                  ┌──────▼─────┐
                  │ categories │  árbol propio del sitio
                  └────────────┘

  store_products ──(product_match_candidates)──► products ──► brands
        "la oferta"                             "la cosa"
```

La distinción clave del diseño:

- **`store_products`** es *una oferta*: "este artículo, en Diunsa, hoy, a L. 295".
- **`products`** es *la cosa en sí*: el mismo juguete, sin importar quién lo venda.

Separarlos es lo que permite comparar precios entre comercios. `store_products`
lo llena el scraper; `products` se puebla emparejando ofertas (por código de
barras primero, por similitud de nombre después).

---

## 3. Tablas

### 3.1 `stores` — los comercios

Una fila por sitio web que se rastrea. Se da de alta una vez.

| Columna | Propósito |
|---|---|
| `slug` | Identificador estable en código y URLs (`diunsa`). |
| `base_url` | Dominio del comercio. |
| `default_currency` | Moneda por defecto (`HNL`) cuando el scraper no la reporta. |
| `strategy_key` | Clave de la implementación de scraping en `src/server/scraping/registry.ts`. |
| `config` | Configuración compartida por todos sus targets: endpoints, headers, IDs internos. Su forma la define cada estrategia. |
| `request_delay_ms`, `max_concurrency`, `request_timeout_ms`, `max_retries` | Política de cortesía. La aplica el cliente HTTP del runner, no cada estrategia. |
| `respect_robots_txt` | Bandera de intención; hoy informativa. |
| `is_active` | Un comercio inactivo no corre aunque sus targets estén activos. |

### 3.2 `scrape_targets` — las unidades de trabajo

Cada fila es *"esta URL/listado, con esta estrategia, cada X minutos"*. Es
exactamente lo que se registra desde el panel.

| Columna | Propósito |
|---|---|
| `kind` | `full_catalog`, `category`, `search`, `product_detail`, `sitemap` o `feed`. |
| `url` | URL pública de referencia. En estrategias basadas en HTML es la que se descarga; en las basadas en API es documentación para humanos. |
| `strategy_key` | Sobrescribe la de la tienda. `null` = hereda. |
| `config` | Parámetros de la estrategia (`groupCode`, selectores CSS, filtros). Se fusiona sobre `stores.config`; **el target gana**. |
| `frequency_minutes` | Cada cuánto vuelve a correr. |
| `max_pages` | Tope de seguridad por corrida. |
| `next_run_at` | El cron elige los targets con `next_run_at <= now()`. Lo recalcula el runner al terminar. |
| `consecutive_failures` / `failure_threshold` | Circuit breaker: tras N fallos seguidos el target se pausa solo y escribe el motivo en `paused_reason`. Evita seguir golpeando un sitio que cambió de estructura o nos está bloqueando. |
| `priority` | Menor = se atiende primero cuando hay varios vencidos. |

### 3.3 `scrape_runs` — la bitácora

Una fila por ejecución. Se abre en estado `running` **antes** de tocar la red y
se cierra al final, pase lo que pase.

Contadores: `items_found`, `items_new`, `items_updated`, `items_unchanged`,
`items_failed`, `items_delisted`, `price_changes`, más telemetría de red
(`http_requests`, `http_errors`, `bytes_downloaded`).

> **Detalle importante:** el índice único parcial
> `scrape_runs_one_active_per_target` impide dos corridas simultáneas del mismo
> target. Es un lock a nivel de datos, no de aplicación: si el cron se solapa
> con una corrida lenta, la segunda se marca `skipped` en vez de duplicar
> trabajo y pelearse por las mismas filas.

### 3.4 `brands` — marcas unificadas

Cada tienda escribe la marca a su manera (`X- SHOT`, `X-Shot`, `XSHOT`).
`normalized_name` es una columna generada que aplica `normalize_text()`, y
`aliases` guarda las variantes vistas. El índice trigram permite búsqueda difusa.

### 3.5 `categories` — el árbol propio

El árbol que ve el usuario final, independiente de cómo categorice cada tienda.
Jerarquía por `parent_id` más un `path` legible (`jugueteria/munecas`).

### 3.6 `store_categories` — el árbol crudo de cada tienda

El árbol tal cual lo publica el comercio, **sin normalizar**. Existe por dos
razones:

1. Es la llave de paginación del scraper (en Diunsa, `groupCode = 258` es
   Juguetería; sin ese código no se puede pedir la categoría).
2. Permite remapear a `categories` sin volver a scrapear.

`external_id` + `store_id` es único. `category_id` apunta al árbol canónico y
queda `null` mientras la categoría no esté clasificada.

### 3.7 `products` — el producto canónico

Una fila por *cosa*, no por oferta. `gtin` (código de barras normalizado a
GTIN-14) es el identificador global más confiable y tiene índice único parcial.
Se puebla por emparejamiento, no por el scraper.

### 3.8 `store_products` — el corazón del sistema

La oferta vigente de un artículo en una tienda. **Snapshot actual**: el histórico
vive en `price_history`.

El conjunto de columnas es deliberadamente amplio y cubre lo que publican
retailers de todo tipo (departamentales, ferreterías, farmacias, súper,
marketplaces), no solo lo que hoy expone Diunsa. Cada scraper llena lo que su
tienda ofrece y deja el resto en `null`; **nunca hay que migrar la tabla al
agregar un comercio más rico**.

Grupos de columnas:

| Grupo | Columnas |
|---|---|
| **Identificadores** | `external_id` (llave de deduplicación junto a `store_id`), `external_code`, `sku`, `mpn`, `gtin`, `barcode_raw`, `ean`, `upc`, `isbn`, `asin`, `seller_name`, `seller_id` |
| **Contenido** | `name`, `normalized_name` (generada), `name_alias`, `slug`, `url`, `canonical_url`, `short_description`, `description`, `highlights`, `brand_raw`, `brand_id`, `manufacturer`, `model`, `color`, `size`, `material`, `condition`, `is_adult` |
| **Clasificación** | `store_category_id`, `category_raw`, `category_path` (breadcrumb), `tags` |
| **Precio** | `currency`, `price`, `list_price`, `discount_percent`, `discount_amount`, `member_price`, `promo_price`, `installment_price`, `installment_count`, `min_price`, `max_price`, `price_per_unit`, `unit_measure_code`, `unit_measure_name`, `unit_amount`, `tax_rate`, `tax_included`, `price_valid_until` |
| **Disponibilidad** | `availability`, `in_stock`, `stock_quantity`, `min_order_quantity`, `max_order_quantity`, `location_availability` (por sucursal) |
| **Reputación** | `rating_average` (0–5), `rating_count`, `review_count` |
| **Medios** | `primary_image_url`, `image_count`, `video_urls` |
| **Logística/postventa** | `has_free_shipping`, `shipping_cost`, `shipping_info`, `warranty_months`, `warranty_info`, `weight_grams`, `length_mm`, `width_mm`, `height_mm` |
| **Libres** | `specs`, `attributes`, `badges`, `meta_title`, `meta_description`, `raw` |
| **Ciclo de vida** | `content_hash`, `first_seen_at`, `last_seen_at`, `last_scraped_at`, `last_price_change_at`, `last_scrape_run_id`, `is_active`, `delisted_at` |

Dos columnas merecen explicación:

- **`content_hash`** — hash SHA-1 del contenido normalizado, calculado por el
  runner. Si no cambió entre corridas, el `UPDATE` se salta por completo y solo
  se refresca `last_seen_at`. En un catálogo de 8 000 artículos donde cambian 40,
  esto es la diferencia entre reescribir 8 000 filas y reescribir 40.
  El hash **excluye `raw`** a propósito: ese payload trae marcas de tiempo de la
  tienda que cambian sin que cambie nada real.

- **`raw`** — el payload original completo. Permite reprocesar la normalización
  sin volver a descargar el sitio.

### 3.9 `store_product_images` y `store_product_variants`

Galería completa y variantes (talla, color, capacidad) con precio y stock
propios. Se separan porque un artículo puede traer decenas de imágenes y en los
listados solo se consulta la principal.

### 3.10 `price_history` — la serie temporal

El activo de largo plazo del proyecto. Se inserta una fila **solo cuando algo
del precio o la disponibilidad cambia** respecto a la observación anterior: así
el histórico crece con la señal, no con la frecuencia del cron. Los productos
nuevos también entran, para tener su precio inicial.

`previous_price`, `price_delta` y `price_delta_pct` se calculan al insertar, para
que el front no tenga que hacer window functions en cada consulta.

### 3.11 `product_match_candidates` — el emparejamiento

Propuestas de unión entre una oferta y un producto canónico, con `confidence`
(0–1), `matched_by` (cómo se dedujo) y `status`. Los matches por código de barras
se auto-aprueban; los difusos quedan `pending` esperando revisión.

---

## 4. Funciones

### `ingest_store_products(p_store_id, p_run_id, p_items) → jsonb`

El motor de ingesta. Recibe un array JSON de productos ya normalizados —cuyas
claves coinciden 1:1 con las columnas de `store_products`, más `images` y
`variants`— y resuelve **todo del lado de Postgres en una sola llamada**:

1. Materializa el lote (con `distinct on (external_id)`, porque `ON CONFLICT DO
   UPDATE` no puede tocar la misma fila dos veces en un comando).
2. Fotografía el estado previo, para calcular el delta de precio.
3. Alta o actualización, saltándose las filas cuyo `content_hash` no cambió.
4. Refresca `last_seen_at` de las que no cambiaron.
5. Inserta en `price_history` solo lo que cambió de verdad.
6. Reemplaza la galería de imágenes de los productos tocados.
7. Upsert de variantes.

Devuelve `{ items_found, items_new, items_updated, items_unchanged, price_changes }`.

**Por qué en SQL y no en la app:** un catálogo completo son ~8 000 artículos.
Hacerlo fila por fila desde Node serían miles de round-trips por corrida.

### `mark_delisted_products(p_store_id, p_run_id, p_scope_store_category_id) → integer`

Marca `is_active = false` en los artículos que no se vieron en el último run.

> ⚠️ **Solo tiene sentido después de un barrido de catálogo completo.** Llamarlo
> tras scrapear una sola categoría daría de baja el resto de la tienda. El runner
> lo aplica únicamente en targets de tipo `full_catalog` y sin errores.

### `to_gtin14(text) → text`

Normaliza cualquier código de barras (UPC-12, EAN-13, GTIN-8) a GTIN-14
rellenando con ceros, para que `4897065735567` en una tienda y `04897065735567`
en otra emparejen. Devuelve `null` si el código no es plausible.

### `normalize_text(text)` y `slugify(text)`

Minúsculas, sin acentos, sin signos, espacios colapsados. `IMMUTABLE` para poder
usarse en columnas generadas e índices.

---

## 5. Vistas

| Vista | Para qué |
|---|---|
| `v_store_products_current` | Oferta activa con tienda, marca y categoría ya resueltas. Base del catálogo público. |
| `v_recent_price_drops` | Bajadas de precio, más reciente primero. Portada y alertas. |
| `v_product_price_comparison` | El mismo producto canónico en varias tiendas, con `price_rank`. |
| `v_scrape_target_health` | Estado y último resultado de cada target. Consulta principal del panel. |

---

## 6. Seguridad

**Modelo:** toda escritura pasa por el servidor de Next con la *service key*
(que ignora RLS). Las claves públicas solo leen el catálogo.

La migración `0012` es la que deja esto en firme. Recorre el catálogo de
Postgres en vez de usar una lista fija, así que **ninguna tabla puede quedarse
fuera por olvido** y volver a correrla protege también las tablas que se agreguen
después.

### Qué queda protegido y cómo

| Grupo | Tablas | `anon` / `authenticated` |
|---|---|---|
| Catálogo público | `stores`, `brands`, `categories`, `store_categories`, `products`, `store_products`, `store_product_images`, `store_product_variants`, `price_history` | **SELECT y nada más.** Una policy de lectura + `revoke insert/update/delete`. |
| Operativas | `scrape_targets`, `scrape_runs`, `product_match_candidates` | **Nada.** RLS activa y *sin ninguna policy*: el resultado siempre es cero filas. Además se revocan los grants, así que ni llegan a evaluar RLS. |

`service_role` tiene `BYPASSRLS`, así que el backend opera con normalidad.

### El hueco que RLS por sí sola no tapa: las vistas

En Postgres una vista se ejecuta **con los permisos de su dueño**, no de quien
consulta. Es decir: una vista sobre una tabla con RLS *salta ese RLS*. Como
`v_scrape_target_health` lee `scrape_targets` y `scrape_runs`, cualquiera con la
llave pública podía leer la configuración del scraper a través de la vista aunque
las tablas estuvieran protegidas.

`0012` marca todas las vistas con `security_invoker = true`, de modo que se
evalúan con las políticas de quien consulta:

- `v_store_products_current`, `v_recent_price_drops` y
  `v_product_price_comparison` siguen siendo públicas (sus tablas lo son).
- `v_scrape_target_health` deja de serlo. El panel la lee con `service_role`, así
  que no se ve afectado.

### Funciones

`0012` fija `search_path = find_your_prices, public, pg_temp` en todas las
funciones del esquema: sin eso, una función resuelve los nombres sin cualificar
contra el `search_path` de quien la llama, que es manipulable. Además
`ingest_store_products` y `mark_delisted_products` solo las puede ejecutar
`service_role`.

### Cómo comprobarlo

La migración termina con una consulta que lista, tabla por tabla, si RLS quedó
activa y cuántas políticas tiene. **`rls_activa` debe ser `true` en todas las
filas**; las públicas muestran 1 política y las operativas 0.

---

## 7. Convenciones

- **Timestamps** siempre `timestamptz`, nunca `timestamp`.
- **Dinero** en `numeric(14,2)`, jamás `float`.
- **Identificadores externos** siempre `text`, aunque parezcan números: los
  ceros a la izquierda importan (`000000001-0000134963`).
- **`updated_at`** lo mantiene el trigger `set_updated_at()`, no la aplicación.
- **Los enums** se amplían con `alter type ... add value`, por eso viven aislados
  en su propia migración.
- Todo lo que una tienda publica y no tiene columna propia va a `raw`, `specs` o
  `attributes` — nunca se descarta.

---

## 8. Cómo agregar una tienda nueva

No requiere tocar la base de datos:

1. Implementar `ScrapeStrategy` en `src/server/scraping/strategies/<tienda>.ts`.
2. Registrarla en `src/server/scraping/registry.ts`.
3. Dar de alta la tienda (`POST /api/scraping/stores`) con esa `strategy_key`.
4. Registrar sus targets desde el panel.

El esquema, el runner, el endpoint de cron y el panel funcionan igual para todas.
