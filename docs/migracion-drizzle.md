# Migración: Supabase → Drizzle + Postgres propio (Hetzner)

Objetivo: dejar de depender de Supabase como plataforma. La app habla con
Postgres directo por Drizzle; al final la base se muda a un servidor en Hetzner
y Supabase se apaga.

## Qué hay hoy (inventario, 2026-10-16)

| Pieza de Supabase | Dónde se usa | Reemplazo |
|---|---|---|
| `supabase-js` / PostgREST (~140 llamadas `.from()`/`.rpc()`) | 22 archivos, sobre todo `src/server/services/*` y `src/server/scraping/repository.ts` | Drizzle (`drizzle-orm` + driver `postgres`) |
| 13 RPC (`ingest_store_products`, `refresh_catalog`, `analytics_report`, …) | servicios | Se quedan como funciones SQL; se llaman con `db.execute(sql\`select …\`)` |
| Storage: 4 buckets (`affiliate-images`, `category-images`, `store-images`, `sitemaps`) | `affiliates.ts`, `categoryContent.ts`, `storeContent.ts`, `sitemapStore.ts`, `scripts/generate-sitemaps.ts` | Cloudflare R2 (ya hay R2 en la cuenta) |
| Roles `anon` / `authenticated` / `service_role` + RLS | 18 migraciones con grants/policies | Un rol `fyp_app` con grants explícitos; RLS deja de ser necesario |
| `pg_cron` (refresh del catálogo cada 30 min, purga de analytics y de errores) | migraciones 0030, 0048, 0051 | `pg_cron` instalado en Hetzner (paquete `postgresql-XX-cron`) |
| Auth | **no se usa** (el panel va con `CRON_SECRET`) | nada que hacer |

Lo que **no** cambia: el esquema `find_your_prices`, las funciones, vistas y la
materializada `mv_catalog`. Las migraciones SQL de `src/db/migrations` siguen
siendo la fuente de verdad; Drizzle se usa para consultar, no para migrar (por
ahora).

## Cómo se conecta cada entorno

- **Producción (Cloudflare Workers)**: Worker → **Hyperdrive** → Postgres.
  Hyperdrive mantiene el pool de conexiones fuera del Worker (un Worker no
  puede sostener conexiones entre requests) y además cachea lecturas.
  Driver: `postgres` (postgres.js), que corre en Workers con `nodejs_compat`.
- **Local, scripts y GitHub Actions**: `DATABASE_URL` directo.
- Mientras sigamos en Supabase: usar el **pooler de Supavisor en modo sesión
  (puerto 5432)** o la conexión directa. Si se usa el modo transacción (6543)
  hay que crear el cliente con `prepare: false`.

## Fases

### Fase 1 — Base de Drizzle (sin tocar comportamiento) ✅
1. Instalar `drizzle-orm`, `postgres`, `drizzle-kit` (dev).
2. `src/server/db/schema.ts`: tablas, vistas y la materializada del esquema
   `find_your_prices` escritas a mano a partir de las migraciones
   (`pgSchema('find_your_prices')`). En la sesión de prueba se compara con
   `drizzle-kit pull` para cazar diferencias.
3. `src/server/db/connection.ts` (re-exportado por `client.ts`, que agrega
   `server-only`): `getDb()` que toma la conexión de Hyperdrive en el Worker
   (`getCloudflareContext().env.HYPERDRIVE`) y de `DATABASE_URL` fuera de él.
   `connection.ts` no lleva `server-only` porque también lo carga `src/proxy.ts`.
4. `drizzle.config.ts` y la variable `DATABASE_URL` en `.env.example`.

### Fase 2 — Migrar consultas, archivo por archivo (de chico a grande) ✅ (sin probar contra la base)
Cada servicio conserva su firma y la forma de lo que devuelve, así los
componentes no se enteran. Orden:
1. `errorLog.ts`, `logError.ts`, rutas `api/scraping/*`, `admin/scraping/page.tsx`
2. `quote.ts`, `sitemap.ts`, `analytics.ts`
3. `storePages.ts`, `categoryPages.ts`, `storeContent.ts`, `categoryContent.ts` (solo DB)
4. `categories.ts`, `affiliates.ts` (solo DB)
5. `scraping/repository.ts` (ingesta, RPC críticas)
6. `catalog.ts` (búsqueda, facetas, conteos, FTS: el más delicado)
7. Scripts: `scrape-all-local.ts`, `import-eneba.ts`, `reingest-local.ts`, `generate-sitemaps.ts`

Los tests que mockean `supabase-js` se reescriben contra el nuevo cliente
(`src/test/drizzleMock.ts`).

Decisiones que conviene saber:
- Las claves del schema de Drizzle son las columnas en snake_case y los
  timestamps salen en ISO (`isoTimestamp` en `server/db/pg.ts`): una fila de
  Drizzle es la misma que devolvía PostgREST, así que las APIs del panel y
  los componentes no cambiaron.
- Las funciones SQL se llaman con `rpc()` (`server/db/rpc.ts`), con
  argumentos por nombre como antes.
- Se fueron las capas de compatibilidad con migraciones viejas: leer de
  `v_store_products_current` si faltaba `mv_catalog`, dejar de pedir columnas
  que una vista no publicaba, calcular facetas sin las vistas de 0013, y el
  `public_slug` opcional del sitemap. La base tiene todas las migraciones
  hasta la 0057 y la de Hetzner llega por dump.
- `src/lib/analytics/botLog.ts` (el registro de bots del proxy) hacía un
  `fetch` directo a la API REST: ahora inserta por Drizzle.
- Ya no hay tope de 1 000 filas por respuesta: los bucles que paginaban por
  eso se simplificaron (categorías del panel, conteos por categoría).
- Quedan en Supabase, para la fase 3: Storage (logos, imágenes de categorías y
  tiendas, sitemaps) y los scripts sueltos `scripts/seed-category-content.mjs`
  y `scripts/relink-category-images.mjs`.

### Fase 3 — Storage a R2 ✅ en código (falta correr la migración)
Un solo bucket (`find-your-prices`) con una carpeta por bucket viejo:
`category-images/`, `store-images/`, `affiliate-images/`, `sitemaps/`. Todo va
por la API S3 de R2 (`src/server/storage/r2.ts`, con `aws4fetch`), así funciona
igual en el sitio (Vercel o Workers), en los scripts y en GitHub Actions; no
hace falta binding.

Pasos para migrar:
1. Cloudflare → R2 → `find-your-prices` → Settings: activar el acceso público
   (dominio propio, p. ej. `assets.findyourprices.com`; el r2.dev solo para
   probar).
2. R2 → Manage API tokens: token con "Object Read & Write" sobre el bucket.
3. En `.env.local`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_PUBLIC_URL` (y siguen `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`,
   que el script usa para leer Storage).
4. `npm run storage:migrate` (ensayo: cuenta archivos y muestra cómo quedan
   las URLs) y después `npm run storage:migrate -- --apply`. Copia lo que
   falte, verifica que cada imagen que usa la base esté en R2 y que el bucket
   responda en público, y recién ahí cambia las URLs en una transacción. Se
   puede repetir sin miedo: lo ya copiado se salta.
5. Las mismas variables `R2_*` en el hosting del sitio. Desplegar.
6. `npm run sitemaps:generate` desde la compu para dejar los sitemaps nuevos
   en R2.

Supabase Storage no se toca: si algo sale mal, se vuelve al commit anterior y
las URLs viejas siguen sirviendo hasta que se borre el proyecto. Quedan
obsoletos `scripts/relink-category-images.mjs` y
`scripts/seed-category-content.mjs` (hablan con la API REST de Supabase).

### Fase 4 — Sesión de prueba (red del teléfono)
Antes: poner `DATABASE_URL` en `.env.local` (Supabase → Connect → "Session
pooler", puerto 5432). Checklist en orden:
1. `npm run db:pull` → conecta y deja la introspección en `drizzle/`; comparar
   columnas con `src/server/db/schema.ts`.
2. `npm run dev` y recorrer: portada, búsqueda (con y sin texto, con un error
   de tipeo para la corrección), filtros y orden, ficha `/p/<slug>` (histórico,
   variantes, precio en lempiras de Eneba), categoría, tienda, tienda ×
   categoría, cotización, aliados y `/go/<aliado>`.
3. Panel: scraping (lista, crear/editar target), categorías (cargar, mapear,
   crear, renombrar), contenido de categorías y tiendas (guardar texto),
   aliados (crear, editar, oferta), tráfico, errores (resolver un grupo).
4. `npm run scrape:local` con una tienda chica, y `npm run sitemaps:generate`.
5. Con `ERRORS_IN_DEV=1` y `ANALYTICS_IN_DEV=1`: que lleguen errores y visitas.
6. `npm run cf:preview` con `localConnectionString` en wrangler.jsonc.

Ojo con esto para producción:
- El build de Cloudflare (Workers Builds) arma páginas consultando la base y
  ahí no hay bindings: `DATABASE_URL` tiene que estar en Settings → Build →
  Variables. En el Worker ya en marcha la conexión sale de Hyperdrive.
- GitHub Actions necesita el secret `DATABASE_URL` (pooler de Supabase: los
  runners no tienen IPv6 y la conexión directa de Supabase es solo IPv6).
- Lo mismo en **Vercel**: con `db.<ref>.supabase.co` el build falla con
  `getaddrinfo ENOTFOUND` al prerenderizar (p. ej. `/aliados`). `DATABASE_URL`
  tiene que ser el "Transaction pooler" (`aws-X-ca-central-1.pooler.supabase.com:6543`,
  usuario `postgres.<ref>`). `getDb()` corta con un mensaje claro si en
  Vercel/CI recibe la conexión directa. El modo sesión (5432) tampoco sirve
  en Vercel: corta en 15 clientes (`EMAXCONNSESSION`) y el build lo agota. En
  Vercel/CI el pool es de 5 conexiones por proceso en modo transacción y 3 en
  modo sesión (`DATABASE_POOL_MAX` lo pisa).
- `npm run build` corre antes `scripts/db-check.mjs` (`prebuild`, solo en
  Vercel/CI): prueba `DATABASE_URL` con timeout de 10 s y, si es el pooler y
  falla, prueba el otro clúster (`aws-0`/`aws-1`) y dice cuál responde. Sin
  esto, una base inalcanzable cuelga cada página 60 s × 3 intentos.
- En modo transacción (6543) el cliente apaga el pipelining de postgres.js
  (`max_pipeline: 0`): Supavisor puede cambiar de backend entre consultas
  encoladas en la misma conexión y la respuesta se pierde
  ([porsager/postgres#970](https://github.com/porsager/postgres/issues/970)).
  Con pool chico y `Promise.all` pasa siempre: el build se trababa en
  `/aliados`, `/` y `/tiendas`. El `db-check` lanza 24 consultas en paralelo
  con un pool de 3 para detectarlo. Con esa opción, postgres.js 3.4.9 rompe
  `db.transaction()` (#1210) y `reserve()` (#1219): hoy no se usan; si hace
  falta atomicidad, hacerlo en una función SQL llamada con `rpc()`.
- Verificar los límites de Hyperdrive y de conexiones TCP en el plan Free de
  Workers antes del corte.

### Fase 5 — Corte a producción todavía sobre Supabase
Crear Hyperdrive apuntando a Supabase, desplegar, mirar errores un par de días.
Así se separa "cambiar la forma de conectarse" de "cambiar de servidor".

### Fase 6 — Mudanza a Hetzner
1. Servidor (CAX11/CX22 alcanza para empezar), Postgres de la **misma versión
   mayor** que Supabase, extensiones: `pg_trgm`, `unaccent`, `fuzzystrmatch`,
   `pgcrypto`, `pg_cron`.
2. Seguridad: firewall que solo deje entrar al 5432 desde las IPs de
   Hyperdrive/GitHub Actions (o túnel), TLS obligatorio, usuario `fyp_app` sin
   superusuario.
3. Migración SQL de limpieza: grants a `fyp_app`, quitar policies que nombran
   roles de Supabase, `statement_timeout` del rol nuevo, recrear los 3 jobs de
   `pg_cron`.
4. `pg_dump --schema=find_your_prices` desde Supabase → `pg_restore` en Hetzner
   → `refresh materialized view` → comparar conteos.
5. Cambiar el origen de Hyperdrive y los secrets de GitHub. Ventana corta: pausar
   el cron de scraping durante el dump.
6. Backups: `pg_dump` diario a R2 (o Storage Box de Hetzner) + probar restaurar.

### Fase 7 — Limpieza
Quitar `@supabase/supabase-js`, `src/server/db/supabase.ts`, variables
`SUPABASE_*` y secrets de GitHub; bajar el plan de Supabase / borrar el proyecto
cuando haya pasado una semana sin incidentes y con backup propio verificado.
