# Cómo agregar una tienda al scraper

> **Este documento está escrito para vos, agente.** Si te pidieron scrapear un
> sitio nuevo (Ladylee, Radio Shack, La Curacao, un supermercado, lo que sea),
> leelo entero antes de escribir una línea. Está pensado para que llegues al
> mismo resultado sin repetir el trabajo de reconocimiento que ya se hizo.
>
> Regla de oro del proyecto: **agregar una tienda no toca la base de datos, ni
> el runner, ni el endpoint, ni el panel.** Si sentís que necesitás modificar
> alguno de esos, parás y lo consultás. Casi siempre significa que el mapeo se
> puede resolver dentro de la estrategia.

---

## 0. El resumen en 30 segundos

```
1. Reconocimiento  → ¿el HTML trae los productos, o hay una API detrás?
2. Estrategia      → src/server/scraping/strategies/<tienda>.ts
3. Registro        → agregarla al array de registry.ts
4. Alta            → POST /api/scraping/stores
5. Targets         → desde /admin/scraping
6. Verificación    → correr, correr otra vez, mirar la segunda corrida
```

El paso 1 es el 80% del trabajo y el que más gente se salta. El paso 6 es el
que detecta los errores que nadie mira.

---

## 1. Reconocimiento: no empieces parseando HTML

**El error más caro es asumir que hay que parsear HTML.** Diunsa lo demuestra:
la página de Juguetería guardada desde el navegador pesa 1 MB y trae 100
productos; la misma URL pedida con `fetch` devuelve 154 KB de esqueletos de
carga y **cero** productos. Es una SPA de Angular: el navegador pinta las
tarjetas después, contra una API JSON.

Esa API resultó tener bastante más de lo que muestra la tarjeta visual: código
de barras, stock, impuesto, ficha técnica, variantes, garantías y la galería
completa. Parsear el HTML habría sido más lento, más frágil y más pobre.

### Diagnóstico en tres comandos

```bash
# 1. ¿Qué devuelve el servidor de verdad?
curl -s -A "Mozilla/5.0" "https://LA-TIENDA/una-categoria" -o /tmp/live.html
wc -c /tmp/live.html

# 2. ¿Los productos están en esa respuesta?
grep -c "PALABRA-DE-UN-PRODUCTO-QUE-VISTE-EN-EL-NAVEGADOR" /tmp/live.html
```

| Resultado | Qué significa | Qué hacer |
|---|---|---|
| Aparece con conteos altos | SSR real | **Todavía no parsees.** Mirá primero si la plataforma publica JSON. |
| Aparece 0 o 1 vez | SPA (React/Angular/Vue) | **Buscá la API.** Sigue abajo. |
| Aparece dentro de un `<script>` JSON | Estado hidratado | Extraé ese JSON, no el DOM. Es lo más estable. |

Para el tercer caso, buscá estos marcadores en el HTML: `__NEXT_DATA__` (Next.js),
`__NUXT__` (Nuxt), `__STATE__` / `__RUNTIME__` (VTEX, muy común en retail
latinoamericano), `ng-state` (Angular), `window.__INITIAL_STATE__`.

### Que el HTML traiga los productos no significa que haya que parsearlo

Ladylee es el caso opuesto a Diunsa y enseña la otra mitad de la lección: su
HTML **sí** trae las 30 tarjetas de la categoría, así que el diagnóstico de
arriba diría "podés parsear". Sería un error. Corre sobre **Shopify**, y
Shopify publica el mismo catálogo como JSON sin autenticación:

```bash
# Si el HTML menciona "Shopify" o "ShopifyAnalytics", probá esto ANTES de parsear:
curl -s "https://LA-TIENDA/collections/UNA-CATEGORIA/products.json?limit=250&page=1" | head -c 400
curl -s "https://LA-TIENDA/collections/UNA-CATEGORIA.json"   # ficha de la colección
```

La regla general: **identificá la plataforma antes de decidir**. Casi todas
tienen una puerta de datos documentada, y siempre es mejor que el DOM porque no
se rompe cuando cambian el tema.

| Marcador en el HTML | Plataforma | Puerta de datos |
|---|---|---|
| `Shopify`, `ShopifyAnalytics`, `cdn.shopify.com` | Shopify | `/collections/{handle}/products.json?limit=250&page=N` |
| `__STATE__`, `vtex-` | VTEX | `/api/catalog_system/pub/products/search` |
| `Mage.Cookies`, `/static/version` | Magento | `/rest/V1/products` |
| `wp-content`, `woocommerce` | WooCommerce | `/wp-json/wc/store/products` |
| `__NEXT_DATA__` | Next.js | El propio JSON embebido |

### Encontrar la API escondida

Cuando es una SPA, la API está a la vista de cualquiera que mire el tráfico:

```
1. Abrí la categoría en el navegador (herramienta Browser del entorno).
2. Ejecutá en la consola de la página:

   performance.getEntriesByType('resource')
     .filter(r => r.initiatorType === 'xmlhttprequest' || r.initiatorType === 'fetch')
     .map(r => r.name)

3. Ignorá analytics (google, facebook, doubleclick, teads, hotjar).
   Lo que queda es la API del sitio.
```

Así apareció `https://apicsm.dapplications.tech/api/em/material/paginate` en
Diunsa. Después se prueba a mano hasta dar con el contrato:

```bash
# Un 400 con mensaje de validación es un REGALO: te dice qué campos faltan.
curl -s -X POST "https://LA-API/endpoint" -H "Content-Type: application/json" -d '{}'
# → {"message":"groupCode should not be empty, officeCode should not be empty, ..."}
```

Probá también los límites: `take=100`, `take=500`, `take=1000`, `take=2000`.
En Diunsa el máximo es 1000; con 2000 responde 400. Saber eso convierte un
catálogo de 8 000 artículos en 9 peticiones.

### Antes de seguir, anotá esto

- URL base de la API y forma exacta del body.
- Cómo se pide el catálogo completo (en Diunsa, `groupCode: "0"`).
- Tamaño máximo de página.
- Si hay un endpoint de categorías (en Diunsa, `material_group/get_cb/1` → 266).
- **Cómo se arma la URL pública de un producto.** Ver la sección 4; es la
  trampa donde es más fácil equivocarse en silencio.

---

## 2. El contrato

Todo vive en [`types.ts`](./types.ts). Implementás una interfaz:

```ts
export interface ScrapeStrategy {
  key: string;                    // 'ladylee' — la misma que va en stores.strategy_key
  label: string;                  // nombre legible para el panel
  supports: ScrapeTargetKind[];   // ['full_catalog', 'category']
  configSchema?: Array<{ key; label; required?; example?; description? }>;
  run(ctx: ScrapeContext): Promise<ScrapeResult>;
}
```

`run` recibe todo resuelto y devuelve productos normalizados:

```ts
interface ScrapeContext {
  store;    // la fila de stores
  target;   // la fila de scrape_targets
  config;   // stores.config fusionado con target.config (el target gana)
  http;     // cliente con reintentos, timeout, cortesía y telemetría
  signal;   // AbortSignal por límite de tiempo
  log;      // deja rastro en scrape_runs.error_log
}

interface ScrapeResult {
  products: NormalizedProduct[];
  categories?: NormalizedCategory[];
  pagesFetched: number;
  totalReported?: number;   // lo que la tienda dice tener
  errors?: Array<{ stage; message; meta? }>;
}
```

### Lo que NO tenés que hacer en la estrategia

Esto ya está resuelto. Si lo reimplementás, estás duplicando y probablemente
peor:

| No hagas | Quién lo hace |
|---|---|
| `fetch` directo, reintentos, timeouts, pausas entre peticiones | `http.ts` |
| Calcular el hash de contenido | `runner.ts` |
| Resolver `store_category_id` | `runner.ts` (vos devolvés `store_category_external_id`) |
| Escribir en la base, historial de precios, imágenes, variantes | `ingest_store_products` en SQL |
| Marcar productos retirados | `runner.ts`, solo en targets `full_catalog` |
| Abrir y cerrar `scrape_runs`, reprogramar el target | `runner.ts` |
| Normalizar el código de barras a GTIN-14 | La función SQL `to_gtin14` |

Tu estrategia solo hace dos cosas: **traer los datos** y **traducirlos** a
`NormalizedProduct`.

---

## 3. Llenar `NormalizedProduct`

Los nombres de campo coinciden 1:1 con las columnas de
`find_your_prices.store_products`, y por eso llegan a la base sin traducción.

**Obligatorios:** `external_id`, `name`, `url`. Nada más.

**Todo lo demás es opcional a propósito.** La tabla tiene ~90 columnas porque
cubre lo que publican comercios de todo tipo: farmacias con principio activo,
supermercados con precio por unidad de medida, marketplaces con vendedor,
ferreterías con dimensiones. Llenás lo que tu tienda publica y dejás el resto
en `null`. **Nunca hace falta migrar la tabla para agregar un comercio.**

### Reglas que importan

**`external_id` — elegí bien, es irreversible en la práctica.**
Es la llave de deduplicación junto a `store_id`. Tiene que ser estable en el
tiempo. Preferí el identificador primario de la API sobre cualquier cosa que se
vea en la URL. En Diunsa es `code` (`"000000001-0000134963"`), no el número que
aparece en el enlace. Si cambia, todos los productos se dan de alta de nuevo y
el histórico de precios se parte en dos.

**Guardá siempre el código de barras en `barcode_raw`.**
Es lo que después permite decir "este mismo televisor cuesta X en Diunsa y Y en
La Curacao". Sin él, el emparejamiento entre tiendas queda en similitud de
nombres, que es mucho peor. En Diunsa lo trae el 66% del catálogo.

**`list_price` solo si hay descuento real.**
Muchas tiendas repiten el precio actual en el campo "antes". Si lo copiás tal
cual, la portada se llena de ofertas del 0%:

```ts
const listPrice = oldPrice !== null && price !== null && oldPrice > price ? oldPrice : null;
```

**`raw` con el payload completo, siempre.**
Es lo que permite reprocesar la normalización sin volver a descargar el sitio.
Cuando dentro de tres meses quieras extraer un campo que hoy ignorás, lo vas a
agradecer.

**`rating_average` en escala 0-5.**
La base tiene un `check` que lo exige. Diunsa entrega puntos acumulados sobre
100 (350 con 4 votos = 87.5), así que hay que convertir. Si tu tienda usa otra
escala, convertí en la estrategia.

**Devolvé `store_category_external_id`, no `store_category_id`.**
El runner traduce el código de la tienda al id interno. Vos no consultás la base.

---

## 4. La trampa: reconstruir la URL pública

Si la API no entrega la URL del producto, hay que armarla. **Es el punto donde
es más fácil equivocarse sin darse cuenta**, porque el resultado *parece*
correcto y solo falla cuando alguien hace clic.

En Diunsa el patrón resultó ser:

```
/{slug(materialGroupName)}/{slug(name)}-{sufijo numérico de code sin ceros}
```

Y el `slug` tiene una particularidad: **borra el apóstrofe en vez de tratarlo
como separador**. `GABBY'S DOLLHOUSE` → `gabbys-dollhouse`, no `gabby-s-dollhouse`.
Un detalle así rompe enlaces en silencio.

### Cómo verificarlo, no adivinarlo

Guardá una página de categoría desde el navegador, extraé los `href` reales y
comparalos contra los que construye tu función:

```js
// Índice por el identificador, no por nombre: hay productos con nombre repetido.
const byId = new Map(apiItems.map(it => [urlId(it.code), it]));
let ok = 0, bad = [];
for (const href of hrefsDelHTML) {
  const item = byId.get(href.split('-').pop());
  if (!item) continue;
  buildUrl(item) === href ? ok++ : bad.push({ real: href, built: buildUrl(item) });
}
console.log('coinciden', ok, '| difieren', bad.length);
```

**No sigas hasta que coincida el 100%.** En Diunsa el primer intento dio 0/100
(estaba usando el campo equivocado), el segundo 95/100 (el apóstrofe), y recién
el tercero 100/100. Esa verificación está congelada en
[`diunsa.test.ts`](./strategies/diunsa.test.ts).

---

## 5. Escribir la estrategia

Copiá [`strategies/diunsa.ts`](./strategies/diunsa.ts) como plantilla. La
estructura que conviene:

```ts
// 1. Tipos de la respuesta de la tienda (interfaces locales, no exportadas)
// 2. Valores por defecto de configuración
// 3. Utilidades de normalización — EXPORTADAS, para poder probarlas sueltas
export function ladyleeSlug(...) {}
export function mapLadyleeItem(...): NormalizedProduct | null {}
// 4. Lectura de config con validación de límites
// 5. La estrategia
export const ladyleeStrategy: ScrapeStrategy = { key, label, supports, run };
```

Exportar el mapeador es lo que hace que se pueda probar sin red. Es la
diferencia entre una suite que corre en un segundo y una que depende de que el
servidor de la tienda esté de buen humor.

### El bucle de paginación

```ts
while (pagesFetched < maxPages) {
  if (ctx.signal.aborted) { /* registrar y salir */ break; }

  let page;
  try {
    page = await ctx.http.postJson(url, body);
  } catch (error) {
    // Una página caída NO debe tirar la corrida entera: se registra y se corta.
    errors.push({ stage: 'paginate', message: String(error), meta: { skip } });
    break;
  }

  const batch = page.data ?? [];
  if (batch.length === 0) break;

  for (const item of batch) {
    const mapped = mapItem(item);
    // La API puede repetir artículos entre páginas: se queda el primero.
    if (mapped && !seen.has(mapped.external_id)) { seen.add(...); products.push(mapped); }
  }

  skip += pageSize;
  if (batch.length < pageSize) break;
  if (totalReported !== undefined && skip >= totalReported) break;
}
```

Tres condiciones de salida y un tope duro de páginas. Sin eso, un cambio en la
API se convierte en un bucle infinito golpeando a la tienda.

**Deduplicá por `external_id`.** No es paranoia: `ingest_store_products` usa
`ON CONFLICT DO UPDATE`, y Postgres falla si un mismo comando toca la misma
fila dos veces. La función SQL tiene su propio `distinct on` como red, pero
mandar duplicados igual es un error.

### Cortesía

Vas a rastrear sitios de comercios reales, con servidores reales. El cliente
HTTP aplica `stores.request_delay_ms` entre peticiones y se identifica con un
User-Agent propio. **No lo esquives.** Si la tienda responde 429, el cliente ya
respeta el `Retry-After`. Si necesitás ir más despacio, subí el delay en la
configuración de la tienda, no bajes el del cliente.

---

## 6. Registrar y dar de alta

```ts
// src/server/scraping/registry.ts
const STRATEGIES: ScrapeStrategy[] = [
  diunsaStrategy,
  ladyleeStrategy,   // ← acá
];
```

```bash
curl -X POST http://localhost:3000/api/scraping/stores \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "ladylee",
    "name": "Ladylee",
    "base_url": "https://www.ladylee.net",
    "strategy_key": "ladylee",
    "config": { "apiBaseUrl": "..." },
    "request_delay_ms": 500
  }'
```

Después, los targets desde `/admin/scraping`. Empezá con **una categoría
chica** y `max_pages: 1`, no con el catálogo completo.

---

## 7. Verificación: lo que de verdad prueba que funciona

### Prueba unitaria del mapeador (obligatoria)

Con un artículo real pegado como fixture. Mirá
[`diunsa.test.ts`](./strategies/diunsa.test.ts). Cubrí como mínimo:

- URL reconstruida idéntica a la real
- Precios convertidos a número
- Que se descarte `list_price` cuando no hay descuento real
- Calificaciones en escala 0-5
- Que se descarten artículos sin identificador o sin nombre

### Prueba contra la API real (opcional, apagada por defecto)

```ts
const enabled = process.env.SCRAPER_LIVE_TESTS === '1';
describe.skipIf(!enabled)('... contra la API real', () => { /* ... */ });
```

Va apagada porque golpea infraestructura de terceros y fallaría en CI cada vez
que su servidor tenga un mal día.

### La verificación que nadie hace y es la más importante

**Corré el target dos veces seguidas.**

| Corrida | Qué tiene que pasar |
|---|---|
| Primera | `itemsNew` = todos, `priceChanges` = todos |
| **Segunda** | **`itemsNew: 0`, `itemsUpdated: 0`, `itemsUnchanged: todos`, `priceChanges: 0`** |

Si la segunda corrida reporta cientos de "actualizados", **tenés un bug** y hay
que arreglarlo antes de seguir: significa que el hash de contenido cambia entre
corridas aunque la tienda no haya cambiado nada. Casi siempre es un campo
volátil que se coló (una marca de tiempo, un token en una URL de imagen, un
orden que varía).

Con eso roto, cada corrida reescribe el catálogo entero y llena
`price_history` de basura. En Diunsa la diferencia medida fue **49 s la
primera corrida contra 6 s la segunda**.

---

## 8. Errores concretos que ya se cometieron acá

| Error | Cómo se ve | Cómo se evita |
|---|---|---|
| Parsear HTML de una SPA | 0 productos, sin excepción | Diagnóstico de la sección 1 |
| `external_id` tomado de la URL | Todo se re-inserta al cambiar el sitio | Usar el id primario de la API |
| Meter `raw` en el hash | Segunda corrida marca todo como actualizado | El runner ya lo excluye — no lo toques |
| `ON CONFLICT` sobre índice parcial | `no unique or exclusion constraint matching` | Repetir el predicado: `on conflict (a, b) where b is not null` |
| `markDelisted` en un target de categoría | Se da de baja el resto de la tienda | Solo en `full_catalog`, y solo sin errores |
| `Number(param) \|\| default` | Un `0` explícito se convierte en el default | Comprobar `null`/`''` aparte |
| Fechas sin `timeZone` fija | Falla de hidratación en React | `timeZone` explícito en `toLocaleString` |
| `texto.slice(0, N)` sobre descripciones | `Empty or invalid json` al ingerir, siempre en el mismo lote | Cortá por caracteres, no por unidades UTF-16. Ver abajo. |
| Asumir que el límite de paginación es uno solo | Barrido que se corta en seco a mitad de una categoría grande | Probá también el **desplazamiento** máximo, no solo el tamaño de página. En Walmart HN la ventana es de 50 y `_from` no pasa de 2500: son 2550 artículos por consulta como techo, sin importar que la categoría declare 4430. La salida fue repartir por subcategorías. |
| Bloquear la estrategia porque un endpoint rechaza al bot | 429 con `rate-limit-reason: bot`, y la tentación de disfrazar el user agent | Probá los demás endpoints antes de rendirte: en Walmart HN `category/tree` y `facets/search` bloquean al bot pero `products/search` y el sitemap no, y con esos dos alcanza. Si el sitio dice que no quiere robots en una puerta, se usa otra. |
| Cortar la paginación por el total que declara la tienda | Barrido incompleto o bucle de más | Verificá el total contra lo entregado. Shopify declara 11 837 en Ladylee y entrega 6 462: cuenta artículos sin publicar. |
| `full_catalog` que no cubre todo el catálogo | `markDelisted` da de baja productos vivos | Si el barrido queda incompleto, devolvé un error no fatal: el runner ya se salta el delisting cuando `errors` no está vacío. |

### El corte que parte un emoji por la mitad

Vale la pena detallarlo porque el síntoma no señala la causa por ningún lado.

Ladylee escribe emojis en sus descripciones. Un `🏖` ocupa **dos** unidades
UTF-16, y `slice(0, 300)` corta por unidad: si el límite cae justo en medio,
queda la mitad alta suelta (`\uD83C`). JavaScript la acepta sin quejarse y
`JSON.stringify` la escribe como `\ud83c`, pero **Postgres rechaza ese escape**
al construir el `jsonb`. PostgREST responde entonces sin cuerpo y supabase-js
informa:

```
Fallo la ingesta del lote 500-750: Empty or invalid json
```

Ese mensaje no nombra el campo ni el artículo, y como el error corta la corrida
entera, todos los lotes siguientes se pierden. Se ve idéntico a un problema de
red o de tamaño de lote, y no lo es: es **determinista**, siempre el mismo lote.

Cómo aislarlo si te vuelve a pasar: bisecá el lote llamando al RPC con mitades
hasta quedarte con un artículo, y después bisecá **por campo** quitando uno a la
vez. En este caso el culpable resultó `short_description`.

La regla: cualquier recorte de texto libre se hace por caracteres reales
(`Array.from(texto)`) y el resultado se sanea contra mitades sueltas. Está
resuelto en `truncate` y `stripLoneSurrogates` de
[`strategies/ladylee.ts`](./strategies/ladylee.ts); reusalos.

---

## 9. Dónde está cada cosa

| Necesitás… | Andá a |
|---|---|
| El contrato completo | [`types.ts`](./types.ts) |
| Un ejemplo terminado (SPA + API privada) | [`strategies/diunsa.ts`](./strategies/diunsa.ts) |
| Un ejemplo terminado (Shopify + catálogo por categorías) | [`strategies/ladylee.ts`](./strategies/ladylee.ts) |
| Un ejemplo terminado (VTEX + reparto por subcategorías) | [`strategies/walmarthn.ts`](./strategies/walmarthn.ts) |
| Cómo se orquesta una corrida | [`runner.ts`](./runner.ts) |
| El cliente HTTP | [`http.ts`](./http.ts) |
| Cómo se escribe en la base | [`repository.ts`](./repository.ts) |
| El esquema, tabla por tabla | [`../../db/docs/documentation.md`](../../db/docs/documentation.md) |
| La función de ingesta en SQL | [`../../db/migrations/0008_ingest_function.sql`](../../db/migrations/0008_ingest_function.sql) |

---

## 10. Lista de verificación final

```
[ ] Confirmé si el sitio es SSR o SPA (no lo asumí)
[ ] Si es SPA, encontré la API y anoté su contrato
[ ] Probé el tamaño máximo de página
[ ] Verifiqué la URL pública contra enlaces reales, al 100%
[ ] external_id es el identificador primario y estable de la tienda
[ ] Guardo barcode_raw cuando existe
[ ] list_price solo cuando hay descuento real
[ ] raw lleva el payload completo
[ ] El bucle tiene tope de páginas y deduplica
[ ] La estrategia está en registry.ts
[ ] Hay prueba unitaria del mapeador con un artículo real
[ ] Corrí el target DOS veces y la segunda dio 0 nuevos / 0 actualizados
[ ] No toqué la base, ni el runner, ni el endpoint, ni el panel
```
