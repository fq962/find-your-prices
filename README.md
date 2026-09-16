## Estructura del proyecto

```
src/
  app/            # Solo enrutamiento (App Router): layout, page, route handlers
    api/          # Route handlers (endpoints propios)
  components/
    ui/           # Primitivas de diseño reutilizables (Button, Input, Card...)
    layout/       # Header, Footer, Shell y demás piezas estructurales
    shared/       # Componentes compuestos usados por más de una feature
  features/       # Módulos de negocio autocontenidos (ver features/README.md)
  hooks/          # Hooks compartidos por toda la app
  lib/            # Utilidades sin estado: formato, constantes, cliente API, validaciones
  server/         # Código exclusivo de servidor: db, services, server actions
  types/          # Tipos TypeScript compartidos globalmente
  config/         # Configuración de sitio/app (metadata, flags...)
public/
  images/         # Imágenes estáticas
  icons/          # Iconos estáticos
```

Reglas rápidas:
- Si algo lo usa una sola feature, vive dentro de `features/<feature>/`; si lo usa más de una, sube a `components/shared` o `lib/`.
- `server/` nunca se importa desde componentes cliente.
- El alias `@/*` apunta a `src/*` (ver `tsconfig.json`).

## Scraping

El sistema rastrea precios de tiendas hondureñas. Está diseñado para escalar a
miles de sitios: agregar un comercio **no toca la base de datos ni el runner**.

### Piezas

```
src/server/scraping/
  types.ts          # Contrato: ScrapeStrategy + NormalizedProduct
  registry.ts       # Registro de estrategias (agregar la tienda nueva aquí)
  http.ts           # Cliente HTTP: reintentos, timeout, cortesía, telemetría
  runner.ts         # Orquesta una corrida: bitácora, hash, ingesta, bajas
  repository.ts     # Acceso a datos (Supabase)
  strategies/
    diunsa.ts       # Primera tienda
  README.md         # ← Manual para agregar una tienda nueva
src/app/api/scraping/
  run/              # Endpoint del cron
  targets/          # CRUD del panel
  stores/ runs/ strategies/
src/app/(es)/admin/scraping/   # Panel web
src/db/migrations/             # SQL para Supabase
src/db/docs/documentation.md   # Documentación del esquema
```

### Cron

```
GET https://tu-dominio.com/api/scraping/run?secret=$CRON_SECRET
```

Corre todos los targets vencidos (`next_run_at <= now()`). Sin `CRON_SECRET`
configurado el endpoint responde 401: un scraper abierto a internet es un ataque
de denegación de servicio gratis contra las tiendas que rastreamos.

Parámetros que importan:

| | Default | Cuándo tocarlo |
|---|---|---|
| `limit` | 5 | **Casi siempre.** Es cuántos targets como máximo atiende una tanda. Con 20 targets registrados, el default deja trabajo sin hacer sin avisar más que con `remaining > 0` en la respuesta. |
| `timeBudgetMs` | 240 000 | Presupuesto **total** de la tanda, no por target. El runner deja de arrancar targets nuevos cuando quedan menos de 15 s. |

### Programación: ancla + intervalo

Un horario son dos datos, no uno: **dónde empieza la rejilla**
(`schedule_anchor_at`) y **cada cuánto se repite** (`frequency_minutes`). Todo
momento válido cumple `next_run_at = ancla + k × intervalo`, y al terminar bien
una corrida el runner salta al primer punto de esa rejilla posterior a ahora.

Eso permite las dos formas que hacen falta, con el mismo mecanismo:

| Lo que querés | Ancla | Intervalo |
|---|---|---|
| Todos los lunes a las 08:00 | un lunes a las 07:55 | 1 semana |
| Cada 3 días a las 03:00 | cualquier día a las 02:55 | 3 días |
| Cada 6 horas | cualquier hora en punto | 6 horas |

**Por qué no se suma desde el final de la corrida.** Era lo que hacía el runner
antes: `next_run_at = now() + intervalo`. Una corrida que empieza a las 08:00:04
y dura 90 s deja la próxima en lunes 08:01:34; el lunes siguiente el cron
dispara a las 08:00:02, todavía no vence, y el target se salta hasta la tanda de
la noche. Desde ahí la agenda se desliza sola y en un mes "los lunes a las 8" ya
cayó en cualquier lado. Con ancla, la duración de la corrida no cuenta.

**Por qué no `cron_expression`** (la columna existe y sigue sin uso): el cron
estándar no sabe decir "cada 3 días". Un paso `/3` en el campo de día de mes
reinicia el conteo cada mes y salta de 1 a 3 días entre el 31 y el 1.

**Por qué el ancla va unos minutos antes de la hora del cron.** Un target es
elegible cuando `next_run_at <= now()`. Si el ancla dice 08:00 exactas y la
plataforma dispara a las 07:59:58, no vence y se cae a la tanda siguiente.
Anclar a las 07:55 elimina la carrera: nada corre a las 07:55 porque a esa hora
no dispara nada, pero a las 08:00 el target ya está vencido con seguridad.

### Repartir el trabajo entre pocas tandas al día

Con el cron disparando, digamos, a las 03:00, 08:00 y 20:00, cada tanda atiende
solo lo que venció. Asignar tienda → día → hora es entonces elegir el ancla de
cada target desde `/admin/scraping`.

Dos cosas garantizan que no se repita trabajo:

1. Al terminar bien, `next_run_at` salta al siguiente punto de la rejilla, así
   que el mismo target no puede volver a caer en la misma tanda.
2. El índice único parcial `scrape_runs_one_active_per_target` impide dos
   corridas vivas del mismo target: si una tanda se solapa con la anterior, la
   segunda responde `skipped` en vez de duplicar la ingesta.

Lo que sí hay que dosificar es el **presupuesto de la tanda**: 240 s repartidos
entre todos los targets que vencieron juntos. Medido en producción, un catálogo
completo cuesta ~300 s (ACOSA), ~165 s (Walmart Abarrotes), ~160 s (Ladylee),
~130 s (Diunsa), ~115 s (Jetstereo), ~50 s (Steren) y ~32 s (PriceSmart). La
regla práctica que sale de ahí: **una tienda pesada por tanda**, o dos livianas.
ACOSA, con 297 s medidos, ya no entra en los 240 s del presupuesto compartido:
necesita una tanda para ella sola y es la próxima candidata a partirse por
categorías, como se hizo con Walmart en la migración 0019.

### Agregar una tienda

> **Manual completo: [`src/server/scraping/README.md`](src/server/scraping/README.md).**
> Está escrito para que un agente lo siga de punta a punta: cómo detectar si un
> sitio es SSR o SPA, cómo encontrar la API que hay detrás, el contrato de datos,
> las trampas concretas y la verificación que de verdad prueba que funciona.

1. Implementar `ScrapeStrategy` en `src/server/scraping/strategies/<tienda>.ts`.
2. Registrarla en `registry.ts`.
3. Dar de alta la tienda (`POST /api/scraping/stores`) con esa `strategy_key`.
4. Registrar sus targets desde `/admin/scraping`.

Nada de eso toca la base de datos, el runner, el endpoint ni el panel.

### Diunsa

diunsa.hn es una SPA de Angular: el HTML del servidor son esqueletos de carga y
los productos los pinta el navegador contra una API JSON. Por eso la estrategia
consume esa API en vez de parsear HTML — es más rápida, más estable y trae campos
que la tarjeta visual no muestra (código de barras, stock, impuesto, ficha
técnica, garantías, galería completa).

Medido contra producción: **catálogo completo = 8 083 artículos en 18 peticiones
y ~49 s**. Una segunda corrida sin cambios reales tarda ~6 s y no escribe nada,
gracias al hash de contenido.

Para revalidar el contrato cuando Diunsa cambie algo:

```bash
SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/diunsa.live.test.ts
```

### PriceSmart

pricesmart.com/es-hn es un Nuxt con Vue Storefront 2: el HTML del servidor pesa
384 KB y trae **cero** productos. Las tarjetas las pinta el navegador contra
Bloomreach Discovery, que el propio sitio expone como proxy
(`/api/br_discovery/getProductsByKeyword`), así que la estrategia consume esa
API en vez de parsear HTML.

Tres particularidades que vale la pena saber:

- **Consultar una categoría raíz incluye a todos sus descendientes**, así que
  las 25 categorías de nivel 1 *son* el catálogo completo. Medido contra
  producción: **2 763 artículos únicos en 31 peticiones y ~19 s**, con 543
  categorías que llegan gratis en el facet de la misma respuesta.
- **El campo `url` de la API apunta al sitio de Costa Rica** y hay que
  ignorarlo. La URL pública de Honduras se arma con `slug` + `master_sku`,
  verificado al 100% contra el sitemap (707/707 exactas).
- **`price` y `sale_price` son siempre 0.** El precio real es `price_HN`, en
  centavos; y `availability_HN` dice `"true"` incluso en artículos agotados, así
  que la señal de existencias es `inventory_HN`.

Para revalidar el contrato cuando PriceSmart cambie algo:

```bash
SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/pricesmart.live.test.ts
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

Este proyecto usa [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) para cargar Space Grotesk (display y UI) e Instrument Serif (la línea editorial del hero).

## SEO

Un comparador de precios vive de la búsqueda orgánica: casi nadie llega
escribiendo "findyourprices.com", llegan buscando *"precio freidora de aire
honduras"*. Por eso el SEO no es una capa cosmética acá — es la superficie
principal del producto, con más de 50 000 fichas que compiten cada una por su
propia consulta.

### Dónde vive

```
src/config/site.ts          # Nombre, descripción, dominio, tiendas, verificaciones
src/lib/seo/
  metadata.ts               # buildPageMetadata(): canónica, hreflang, OG, Twitter
  keywords.ts               # Palabras clave del sitio y por producto
  schema.ts                 # Constructores de JSON-LD (schema.org)
  JsonLd.tsx                # Componente que emite el <script type="application/ld+json">
  ProductOgTags.tsx         # og:type=product y etiquetas product:* (precio en WhatsApp)
  productSeo.ts             # Título, descripción y migas de una ficha
  legalSeo.ts               # Lo mismo para las tres páginas legales
  ogImage.tsx               # Tarjeta de vista previa 1200×630 (next/og)
  sitemapXml.ts             # Serialización de <urlset> y <sitemapindex>
  sitemaps.ts               # Rutas de los sitemaps, en un solo lugar
src/server/services/sitemap.ts   # Lectura ligera del catálogo para los sitemaps
src/app/robots.ts                # robots.txt
src/app/manifest.ts              # manifest.webmanifest
scripts/generate-icons.mjs       # Regenera favicon.ico y apple-icon.png
```

### Qué emite cada página

| | Portada | Acerca / legales | Ficha de producto |
|---|---|---|---|
| `<title>` + descripción | ✅ con lema | ✅ propias | ✅ **con el precio en el título** |
| Canónica + `hreflang` (es / en / `x-default`) | ✅ | ✅ | ✅ |
| Open Graph + Twitter card | tarjeta de marca | tarjeta de marca | foto del producto |
| `og:type` | `website` | `article` | `product` + `product:price:*` |
| JSON-LD | `Organization`, `WebSite`, `CollectionPage`, `ItemList` | `Organization`, `WebSite`, `AboutPage`/`WebPage`, `BreadcrumbList` | `Product`, `Offer`, `ItemPage`, `BreadcrumbList` |

Todo el JSON-LD va en **un solo `@graph`** por página, no en cinco `<script>`
sueltos: así los nodos se referencian por `@id` —el producto apunta a su
página, la página al sitio, el sitio a la organización— y Google lee una
entidad coherente en vez de cinco islas.

Regla que sigue todo `schema.ts`: **no se declara lo que no se sabe**. Sin
calificaciones, sin disponibilidad y sin descuento inventados. Un
`aggregateRating` falso es motivo de sanción manual, además de mentira.

### Sitemaps

El catálogo pasa de 50 000 artículos, que es justo el límite de URLs por archivo
del protocolo. Así que `/sitemap.xml` es un **índice**, no una lista:

```
/sitemap.xml                  → índice (lo único que se da de alta en Search Console)
├─ /sitemaps/pages.xml        → portada + acerca + términos + privacidad + uso de contenido
│                               (las 5 páginas × 2 idiomas, con alternates recíprocos)
├─ /sitemaps/products/1.xml   → 10 000 fichas
├─ /sitemaps/products/2.xml   → 10 000 fichas
└─ …                          → tantos como haga falta, calculados del conteo real
```

Cada ficha aparece una sola vez, con la URL en español como `<loc>` y la
inglesa como `hreflang`: listar las dos duplicaría el archivo sin agregar una
página que Google no descubra igual. El `lastmod` es la fecha real del último
chequeo del scraper, no la del despliegue.

`app/sitemap.ts` (la convención de Next) **no** se usa: sólo sabe emitir
`<urlset>` y lo que hace falta en la raíz es un `<sitemapindex>`.

### Iconos

El mark —una lupa con una flecha de bajada de precio— vive en
`src/app/icon.svg`. Los rásteres (`favicon.ico` con 16/32/48 px y
`apple-icon.png` de 180 px) se generan desde la misma geometría:

```bash
node scripts/generate-icons.mjs src/app
```

Si se edita el SVG, hay que editar también las coordenadas del script y volver
a correrlo, o el icono de la pestaña dejará de coincidir con el del escritorio.

### Configuración por entorno

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Origen público. **Crítico**: si en producción queda con una URL de preview de Vercel, todas las canónicas apuntan ahí y Google indexa el dominio equivocado. Debe decir `https://findyourprices.com`. |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Verificación de Search Console (opcional). |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Verificación de Bing Webmaster Tools (opcional). |
| `NEXT_PUBLIC_YANDEX_VERIFICATION` | Verificación de Yandex (opcional). |

### Qué falta / decisiones tomadas a propósito

- **Sin `SearchAction`** en el `WebSite`: la búsqueda del catálogo vive en el
  estado del componente, no en la URL, así que no hay dirección a la que un
  buscador pueda mandar una consulta. Declarar una que no funciona es peor que
  no declarar ninguna. (Google además retiró la caja de búsqueda de enlaces de
  sitio a finales de 2024.) Si algún día la búsqueda se refleja en la URL
  (`/?q=…`), agregarla en `schema.ts`.
- **Sin páginas de categoría.** Hoy las migas de una ficha llevan la categoría
  apuntando a la portada. Son la mayor oportunidad pendiente: "televisores
  honduras precios" no tiene página propia a la cual rankear. Cuando existan,
  el único lugar a tocar es `productBreadcrumbs` en `productSeo.ts`.
- **Rastreadores de IA sin bloquear.** `robots.ts` tiene el comentario de dónde
  se haría; se dejó abierto porque es una decisión de producto, no de SEO.

## Idiomas

El idioma vive en la URL: `/` sirve español (default del sitio, sin prefijo) y `/en` sirve inglés. Cada ruta tiene su propio root layout (`src/app/(es)/layout.tsx` y `src/app/en/layout.tsx`) para que `<html lang>` sea correcto ya en el HTML del servidor.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
