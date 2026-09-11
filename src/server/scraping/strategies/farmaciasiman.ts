import type {
  AvailabilityStatus,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';

/**
 * Estrategia de scraping para Farmacia Siman (https://www.farmaciasiman.com).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * El sitio es una SPA de AngularJS (`ng-app="AppFS"`). CloudFront devuelve
 * 403 sin un User-Agent de navegador (no es un bloqueo de robots.txt: la ruta
 * ni siquiera existe como archivo estatico, cae al shell de la SPA con 200).
 * Con un user agent normal el html trae cero productos; las tarjetas las
 * pinta el navegador contra una API JSON aparte.
 *
 * Esa API (`ecommerce-api.farmaciasiman.com` / `webmail.farmaciasiman.com`)
 * es publica y sin autenticacion:
 *
 *   GET {searchApiUrl}?sucursalId=N&descripcion=TERMINO&busquedaExacta=false
 *       &busquedaSinInventario=true&pagina=N&elementosPorPagina=N
 *   -> { elementosTotales, pagina, paginas, productos: [...] }
 *
 * ---------------------------------------------------------------------------
 * El problema: tope duro de 100 resultados por busqueda
 * ---------------------------------------------------------------------------
 * Verificado contra el sitio (2026-09-11): terminos amplios ("crema", "tab",
 * "jarabe", "para") devuelven siempre exactamente 100, sin importar
 * `elementosPorPagina` (probado hasta 1000) ni la pagina pedida (la 6 en
 * adelante responde vacio). No es coincidencia: es un tope del backend, igual
 * de real aunque el numero sea otro que en otras tiendas.
 *
 * La API tampoco expone un filtro por categoria/linea -- `GET
 * {gatewayUrl}/producto/api/buscador/filtros` solo lista los campos
 * facetables (`ingredientes_activos`, `presentacion`, `marca`, `precio`), y
 * ninguno de esos filtros acepta la categoria interna (`lineaId`) que trae
 * cada producto. No hay forma de "pedir la categoria completa" sin pasar por
 * `descripcion`.
 *
 * ---------------------------------------------------------------------------
 * La solucion: refinamiento adaptativo de prefijos
 * ---------------------------------------------------------------------------
 * `descripcion` filtra por texto: cualquier termino que empieza una consulta
 * "amplia" (una letra) devuelve un subconjunto de lo que devolveria vacio, y
 * agregarle una letra mas (`"a"` -> `"ac"` -> `"ace"`) solo puede angostar el
 * resultado, nunca ampliarlo -- es verdad sea cual sea el algoritmo de
 * coincidencia real del backend (por palabra completa, por prefijo de
 * palabra, o subcadena). Esa propiedad de subconjunto es la que hace segura
 * la recursion sin tener que adivinar la semantica exacta de busqueda.
 *
 * El barrido arranca en 36 semillas (`a`-`z`, `0`-`9`: prefijo minimo que en
 * la practica cubre todo nombre de producto real). Si una semilla devuelve
 * `elementosTotales >= 100` (tope sospechado), se abandona esa consulta y se
 * la reemplaza por 36 hijas (`prefijo + caracter`) en vez de confiar en sus
 * primeros 100 resultados. Si una rama llega a `MAX_PREFIX_LEN` y sigue en el
 * tope, se aceptan esos 100 como mejor esfuerzo y se registra un error no
 * fatal de cobertura (el runner ya se salta el delisting cuando hay errores).
 *
 * No hay forma de probar cobertura 100% sin una fuente independiente (no hay
 * sitemap de productos ni endpoint de conteo total), pero el barrido de
 * prefijos es estrictamente mejor que una sola consulta amplia: cualquier
 * producto que un termino de una letra encuentre, sus refinamientos tambien
 * lo encuentran (es el mismo conjunto repartido en baldes mas chicos).
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-11)
 * ---------------------------------------------------------------------------
 *
 *   - **`productoId` es el identificador estable** (ej. "0010-3693"). No es
 *     un id de Mongo ni cambia entre corridas: es el codigo de articulo del
 *     ERP, igual que en las demas farmacias de este scraper.
 *
 *   - **El precio vigente es `precios.precioEcommerce`**, no `precio` (que en
 *     la practica coincide, pero `precioEcommerce` es el que la ficha
 *     realmente cobra). `precios.precioSinDescuento` es el precio de lista.
 *
 *   - **No hay endpoint que traduzca `lineaId` a un nombre de categoria.** El
 *     producto solo trae el codigo numerico interno. Se guarda en
 *     `store_category_external_id` para no perder el dato, pero no se manda
 *     `categories`: sin nombre no hay arbol que sincronizar. Si algun dia
 *     aparece un endpoint de categorias, ahi se agrega.
 *
 *   - **`imagenUrl` es una ruta relativa** ("/0010-3693/0010-3693_1.jpg") que
 *     se sirve desde CloudFront (`https://d2wuoo4cuot0vy.cloudfront.net`), no
 *     desde el dominio del sitio.
 *
 *   - **La url publica es `{webBaseUrl}/productos/detalle/{productoId}`**,
 *     confirmado contra la definicion de ruta de Angular
 *     (`state("productoDetalle",{url:"/productos/detalle/:productoId"...`).
 *
 *   - **`invActual` es el stock real**; `disponibilidadStock` es una bandera
 *     derivada (1/0) que coincide con `invActual > 0` en todo lo observado.
 *     `descontinuado` ("S"/"N") manda por encima de ambas: un articulo
 *     descontinuado con stock viejo no deberia venderse mas.
 *
 *   - **CloudFront bloquea sin User-Agent de navegador** (403 generico, sin
 *     distinguir bots). No hay robots.txt real que consultar (la ruta cae al
 *     shell de la SPA con 200), asi que no hay reglas explicitas que respetar
 *     mas alla de identificarse con el user agent propio del proyecto.
 */

// -----------------------------------------------------------------------------
// 1. Forma de la respuesta de la API de busqueda
// -----------------------------------------------------------------------------

interface SimanPrecios {
  precioSinDescuento?: number | null;
  precioPublico?: number | null;
  precioEcommerce?: number | null;
}

interface SimanPresentacion {
  cantidad?: number | null;
  unidadMedida?: string | null;
  precios?: SimanPrecios | null;
}

interface SimanDoc {
  productoId?: string | null;
  prod_Desc?: string | null;
  imagenUrl?: string | null;
  proveedor?: string | null;
  lineaId?: number | null;
  precio?: number | null;
  precios?: SimanPrecios | null;
  presentacion?: SimanPresentacion | null;
  invActual?: number | null;
  disponibilidadStock?: number | null;
  descontinuado?: string | null;
  esControlado?: boolean | null;
  requiereReceta?: boolean | null;
  [key: string]: unknown;
}

interface SimanSearchResponse {
  elementosTotales?: number;
  pagina?: number;
  elementosPorPagina?: number;
  paginas?: number;
  productos?: SimanDoc[];
}

// -----------------------------------------------------------------------------
// 2. Valores por defecto
// -----------------------------------------------------------------------------

const DEFAULTS = {
  searchApiUrl: 'https://webmail.farmaciasiman.com/Farmacia-Ecommerce-General-Api/api/productos/buscador/',
  webBaseUrl: 'https://www.farmaciasiman.com',
  imageBaseUrl: 'https://d2wuoo4cuot0vy.cloudfront.net',
  sucursalId: 5,
  pageSize: 100,
} as const;

/** Tope observado de `elementosTotales`. Igual o por encima, se sospecha corte. */
const CAP_THRESHOLD = 100;

/** Largo maximo de prefijo antes de aceptar el tope como mejor esfuerzo. */
const MAX_PREFIX_LEN = 4;

/** Tope duro de peticiones por corrida, para que un cambio de API no sea un bucle. */
const MAX_REQUESTS_HARD_LIMIT = 4000;

/**
 * Semillas de un caracter para el barrido de catalogo completo. Cubre todo
 * nombre de producto que empiece (o contenga, segun el algoritmo real del
 * backend) una letra o digito -- practicamente el 100% de un catalogo de
 * farmacia. Se puede sobreescribir con `config.seedTerms`.
 */
const DEFAULT_SEED_TERMS = 'abcdefghijklmnopqrstuvwxyzñ0123456789'.split('');

interface SimanConfig {
  searchApiUrl: string;
  webBaseUrl: string;
  imageBaseUrl: string;
  sucursalId: number;
  pageSize: number;
  seedTerms: string[];
  maxPrefixLen: number;
}

// -----------------------------------------------------------------------------
// 3. Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

export function round2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function buildSimanSearchUrl(
  term: string,
  page: number,
  config: Pick<SimanConfig, 'searchApiUrl' | 'pageSize' | 'sucursalId'>,
): string {
  const base = config.searchApiUrl.replace(/\/*$/, '/');
  const params = new URLSearchParams({
    sucursalId: String(config.sucursalId),
    descripcion: term,
    busquedaExacta: 'false',
    busquedaSinInventario: 'true',
    pagina: String(page),
    elementosPorPagina: String(config.pageSize),
  });
  return `${base}?${params.toString()}`;
}

/** `{webBaseUrl}/productos/detalle/{productoId}`, confirmado contra la ruta de Angular. */
export function buildSimanProductUrl(productoId: string, webBaseUrl: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/productos/detalle/${encodeURIComponent(productoId)}`;
}

/** `imagenUrl` es relativo a CloudFront, no al dominio del sitio. */
export function buildSimanImageUrl(imagenUrl: string | null | undefined, imageBaseUrl: string): string | null {
  const path = imagenUrl?.trim();
  if (!path) return null;
  return `${imageBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * `descontinuado` manda por encima del stock: un articulo descontinuado no
 * vuelve a existir aunque el ultimo numero de inventario haya sido positivo.
 */
export function toAvailability(
  descontinuado: string | null | undefined,
  invActual: number | null | undefined,
): AvailabilityStatus {
  if ((descontinuado ?? '').trim().toUpperCase() === 'S') return 'discontinued';
  if (invActual === null || invActual === undefined) return 'unknown';
  return invActual > 0 ? 'in_stock' : 'out_of_stock';
}

/**
 * Traduce un documento de la API al contrato comun del sistema.
 *
 * Devuelve null cuando falta lo que identifica al articulo: sin
 * `productoId` no hay llave de deduplicacion, y sin nombre no hay ficha.
 */
export function mapSimanProduct(
  doc: SimanDoc,
  config: Pick<SimanConfig, 'webBaseUrl' | 'imageBaseUrl'>,
  currency: string,
): NormalizedProduct | null {
  const externalId = (doc.productoId ?? '').toString().trim();
  const name = doc.prod_Desc?.trim();
  if (!externalId || !name) return null;

  const precios = doc.precios ?? {};
  const price = round2(precios.precioEcommerce ?? precios.precioPublico ?? doc.precio ?? null);

  // Solo cuenta como precio de lista si es de verdad mayor que el vigente:
  // varias tiendas repiten el precio actual en el campo "sin descuento".
  const rawListPrice = round2(precios.precioSinDescuento ?? null);
  const listPrice = rawListPrice !== null && price !== null && rawListPrice > price + 0.005 ? rawListPrice : null;

  const discountAmount = listPrice !== null && price !== null ? round2(listPrice - price) : null;
  const discountPercent =
    listPrice !== null && price !== null && listPrice > 0
      ? round2(((listPrice - price) / listPrice) * 100)
      : null;

  const availability = toAvailability(doc.descontinuado, doc.invActual);
  const image = buildSimanImageUrl(doc.imagenUrl, config.imageBaseUrl);

  const presentacion = doc.presentacion ?? null;
  const pricePerUnit = round2(presentacion?.precios?.precioEcommerce ?? null);

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (availability === 'out_of_stock') badges.push('agotado');
  if (availability === 'discontinued') badges.push('descontinuado');
  if (doc.esControlado) badges.push('controlado');
  if (doc.requiereReceta) badges.push('requiere receta');

  return {
    external_id: externalId,
    sku: externalId,
    name,
    url: buildSimanProductUrl(externalId, config.webBaseUrl),

    brand_raw: doc.proveedor?.trim() || null,

    // No hay endpoint que traduzca lineaId a nombre: se guarda el codigo
    // crudo y se deja sin sincronizar el arbol de categorias (ver cabecera).
    store_category_external_id: doc.lineaId !== null && doc.lineaId !== undefined ? String(doc.lineaId) : null,

    currency,
    price,
    list_price: listPrice,
    discount_amount: discountAmount,
    discount_percent: discountPercent,
    price_per_unit: pricePerUnit,
    unit_measure_name: presentacion?.unidadMedida?.trim() || null,
    unit_amount: presentacion?.cantidad ?? null,

    availability,
    in_stock: availability === 'unknown' ? null : availability === 'in_stock',
    stock_quantity: doc.invActual ?? null,

    primary_image_url: image,
    images: image ? [{ url: image, position: 0, is_primary: true, alt_text: name }] : [],

    badges,

    raw: doc as unknown as Record<string, unknown>,
  };
}

// -----------------------------------------------------------------------------
// 4. Configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): SimanConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };

  // Ojo con `Number(x) || fallback`: un 0 explicito caeria en el fallback.
  const rawSucursal = raw.sucursalId;
  const sucursalId =
    rawSucursal === undefined || rawSucursal === null || rawSucursal === ''
      ? DEFAULTS.sucursalId
      : Number(rawSucursal);

  const rawPageSize = raw.pageSize;
  const pageSize =
    rawPageSize === undefined || rawPageSize === null || rawPageSize === ''
      ? DEFAULTS.pageSize
      : Number(rawPageSize);

  const seeds = Array.isArray(raw.seedTerms)
    ? raw.seedTerms.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : [];

  const rawMaxPrefix = raw.maxPrefixLen;
  const maxPrefixLen =
    rawMaxPrefix === undefined || rawMaxPrefix === null || rawMaxPrefix === ''
      ? MAX_PREFIX_LEN
      : Number(rawMaxPrefix);

  return {
    searchApiUrl: str('searchApiUrl', DEFAULTS.searchApiUrl),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    imageBaseUrl: str('imageBaseUrl', DEFAULTS.imageBaseUrl).replace(/\/+$/, ''),
    sucursalId: Number.isFinite(sucursalId) && sucursalId > 0 ? Math.trunc(sucursalId) : DEFAULTS.sucursalId,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.trunc(pageSize), 100) : DEFAULTS.pageSize,
    seedTerms: seeds.length > 0 ? seeds.map((s) => s.trim().toLowerCase()) : [...DEFAULT_SEED_TERMS],
    maxPrefixLen: Number.isFinite(maxPrefixLen) && maxPrefixLen > 0 ? Math.trunc(maxPrefixLen) : MAX_PREFIX_LEN,
  };
}

/**
 * Rota las semillas segun la corrida anterior.
 *
 * El barrido no tiene memoria entre corridas: `ScrapeContext` no da forma de
 * escribir un cursor de vuelta a `scrape_targets` (y agregarla ahi es un
 * cambio transversal al runner, no de esta estrategia -- ver README de
 * scraping, seccion "que NO hacer"). Sin rotacion, un cron diario con
 * `max_pages` chico repetiria siempre las mismas ~36 raices y nunca llegaria
 * a las hijas de las que topan el tope.
 *
 * Rotar el orden de arranque con `target.last_run_at` (que cambia en cada
 * corrida) hace que una corrida distinta quede primero en la cola cada vez,
 * asi que con el tiempo todas las raices -- y sus ramas -- tienen turno cerca
 * del frente antes de que se acabe el presupuesto de peticiones. No garantiza
 * cobertura completa en un numero fijo de corridas, pero es estrictamente
 * mejor que repetir el mismo balde para siempre.
 */
export function rotateSeeds(seeds: string[], lastRunAt: string | null | undefined): string[] {
  if (seeds.length === 0) return seeds;
  const ts = lastRunAt ? Date.parse(lastRunAt) : Number.NaN;
  if (!Number.isFinite(ts)) return seeds;

  // Un modulo directo sobre `ts` se ve tentador, pero un dia (86 400 000 ms)
  // es multiplo exacto de casi cualquier cantidad chica de semillas -- con 36
  // (el default), `ts % 36` da el MISMO offset corrida tras corrida en un
  // cron diario, que es justo el problema que se queria resolver. El hash
  // multiplicativo (Knuth) rompe esa periodicidad.
  const hashed = Math.imul(Math.floor(ts / 1000) ^ 0x9e3779b9, 2654435761) >>> 0;
  const offset = hashed % seeds.length;
  if (offset === 0) return seeds;
  return [...seeds.slice(offset), ...seeds.slice(0, offset)];
}

// -----------------------------------------------------------------------------
// 5. Estrategia
// -----------------------------------------------------------------------------

export const farmaciasimanStrategy: ScrapeStrategy = {
  key: 'farmaciasiman',
  label: 'Farmacia Siman (buscador propio, barrido de prefijos)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'seedTerms',
      label: 'Terminos semilla',
      example: '["ibuprofeno","acetaminofen"]',
      description:
        'Solo para targets de categoria: terminos con los que arrancar el barrido (ver "descripcion" de ' +
        'la API). Por defecto, para catalogo completo se usan las 36 letras/digitos.',
    },
    {
      key: 'sucursalId',
      label: 'Codigo de sucursal',
      example: '5',
      description: 'Sucursal que fija precio y stock mostrados. Por defecto 5.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '100',
      description: 'Maximo real observado: 100.',
    },
    {
      key: 'maxPrefixLen',
      label: 'Profundidad maxima de refinamiento',
      example: '4',
      description:
        'Cuantos caracteres puede crecer un termino semilla antes de aceptar el tope de 100 como mejor ' +
        'esfuerzo y registrar un error de cobertura.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    if (ctx.target.kind === 'category' && config.seedTerms.length === 0) {
      return {
        products: [],
        pagesFetched: 0,
        errors: [
          { stage: 'config', message: 'El target de categoria no define "seedTerms" en su configuracion' },
        ],
      };
    }

    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    const maxRequests = Math.min(ctx.target.max_pages ?? MAX_REQUESTS_HARD_LIMIT, MAX_REQUESTS_HARD_LIMIT);

    // Cola de terminos a probar. Un termino que topa el tope se reemplaza por
    // sus 36 hijas en vez de aceptarse tal cual (ver cabecera). Se rota el
    // orden de arranque para que una corrida sin presupuesto para cubrir todo
    // no repita siempre el mismo balde (ver rotateSeeds).
    const queue: string[] = rotateSeeds(config.seedTerms, ctx.target.last_run_at);
    let requests = 0;
    let aborted = false;

    const addBatch = (batch: SimanDoc[] | undefined) => {
      for (const doc of batch ?? []) {
        const mapped = mapSimanProduct(doc, config, currency);
        if (!mapped) continue;
        // Balde distinto puede repetir el mismo articulo (ej. "crema" y
        // "cremas" se solapan): se queda la primera aparicion.
        if (seen.has(mapped.external_id)) continue;
        seen.add(mapped.external_id);
        products.push(mapped);
      }
    };

    while (queue.length > 0 && requests < maxRequests) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'sweep', message: 'Corrida abortada por limite de tiempo' });
        aborted = true;
        break;
      }

      const term = queue.shift()!;
      let first: SimanSearchResponse;
      try {
        first = await ctx.http.getJson<SimanSearchResponse>(buildSimanSearchUrl(term, 1, config));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'search', message, meta: { term } });
        ctx.log('error', `Fallo la busqueda "${term}": ${message}`);
        continue;
      }
      requests += 1;

      const total = first.elementosTotales ?? 0;
      if (total === 0) continue;

      const suspectTruncated = total >= CAP_THRESHOLD;
      if (suspectTruncated && term.length < config.maxPrefixLen) {
        // No confiar en este balde: se reparte en 36 hijos mas angostos.
        for (const char of DEFAULT_SEED_TERMS) queue.push(term + char);
        continue;
      }

      if (suspectTruncated) {
        const message =
          `El termino "${term}" alcanzo el tope de ${CAP_THRESHOLD} resultados en la profundidad maxima ` +
          `(${config.maxPrefixLen}); puede faltar cobertura en esta rama`;
        errors.push({ stage: 'coverage', message, meta: { term, total } });
        ctx.log('warn', message);
      }

      addBatch(first.productos);

      const totalPages = Math.min(first.paginas ?? 1, Math.ceil(CAP_THRESHOLD / config.pageSize));
      for (let page = 2; page <= totalPages && requests < maxRequests; page += 1) {
        if (ctx.signal.aborted) {
          errors.push({ stage: 'sweep', message: 'Corrida abortada por limite de tiempo', meta: { term, page } });
          aborted = true;
          break;
        }
        let next: SimanSearchResponse;
        try {
          next = await ctx.http.getJson<SimanSearchResponse>(buildSimanSearchUrl(term, page, config));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: 'search', message, meta: { term, page } });
          ctx.log('error', `Fallo la busqueda "${term}" pagina ${page}: ${message}`);
          break;
        }
        requests += 1;
        if (!next.productos || next.productos.length === 0) break;
        addBatch(next.productos);
      }

      if (aborted) break;
    }

    if (requests >= maxRequests && queue.length > 0) {
      const message = `Se alcanzo el tope de ${maxRequests} peticiones con ${queue.length} terminos sin probar`;
      errors.push({ stage: 'sweep', message, meta: { maxRequests, pendingTerms: queue.length } });
      ctx.log('warn', message);
    }

    return {
      products,
      pagesFetched: requests,
      errors,
      stats: {
        seedTerms: config.seedTerms.length,
        sucursalId: config.sucursalId,
        uniqueProducts: products.length,
        termsRemaining: queue.length,
      },
    };
  },
};
