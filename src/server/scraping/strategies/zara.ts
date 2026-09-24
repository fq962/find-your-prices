import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  NormalizedVariant,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { HttpError } from '../http';

/**
 * Estrategia de scraping para Zara Honduras (https://www.zara.com/hn/).
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-19)
 * ---------------------------------------------------------------------------
 * El sitio es una SPA propia de Inditex: el html de cualquier pagina es un
 * desafio interstitial de Akamai (`bm-verify`) y no trae productos. La misma
 * SPA se alimenta de una API JSON publica, sin autenticacion:
 *
 *   GET {webBaseUrl}{storePath}/categories?ajax=true
 *       -> { categories: [ MUJER, HOMBRE, NIÑOS, TRAVEL MODE ] } (1 491 nodos)
 *   GET {webBaseUrl}{storePath}/category/{id}/products?ajax=true
 *       -> { productGroups: [{ elements: [{ commercialComponents: [...] }] }] }
 *
 * Notas de campo verificadas contra el sitio:
 *   - **No hay paginacion**: una categoria viene entera en una sola respuesta
 *     (hasta 4-14 MB sin comprimir; Akamai la sirve en brotli, ~7%). Solo la
 *     de "VER TODO" de hombre corta en 3 000 componentes: es un tope, no un
 *     catalogo, y por eso no sirve como fuente unica.
 *   - **Akamai devuelve 403 a todo user agent que no parezca navegador**,
 *     incluido nuestro bot honesto, `curl`, `Googlebot` y hasta para
 *     robots.txt. No es un "no queremos robots en esta puerta" con
 *     alternativa (como en Walmart): es un muro general y sin otra puerta
 *     (no hay sitemap de productos para HN). robots.txt, leido con un
 *     navegador, permite estas rutas (solo prohibe `/status/*?ajax=true`).
 *     La decision de rastrear igual se tomo con el dueño del proyecto el
 *     2026-09-19 y se aplica desde `stores.user_agent`, que existe para eso:
 *     la estrategia NO disfraza nada por su cuenta. Si el 403 vuelve, lo dice
 *     con todas las letras en la bitacora.
 *   - Cada `commercialComponent` es un **producto-color** (y a veces un
 *     producto-color-styling: el mismo modelo y color puede tener dos `id`
 *     distintos con `stylingId` diferente). Un modelo sale con hasta 12 `id`
 *     en un listado y cada listado muestra un color distinto del mismo
 *     modelo. Por eso `external_id` es `seo.seoProductId` (el modelo, 8
 *     digitos, el mismo que va en la url) y los colores son `variants`
 *     identificadas por `canonicalReference` sin temporada.
 *   - Precios en centavos de lempira: 149500 = L 1.495,00 (verificado contra
 *     la pagina). `oldPrice` solo existe cuando hay rebaja real (11 de 746 en
 *     Pantalones); `displayDiscountPercentage` viene calculado.
 *   - `type: "Bundle"` con `kind: "Marketing"` son banners incrustados en la
 *     grilla, sin precio ni referencia: se descartan. `kind: "Fragance"` y
 *     `kind: "Other"` (zapatos, bolsos) son productos normales.
 *   - `availability` toma `in_stock`, `coming_soon` y `out_of_stock`
 *     (medido sobre 51 701 componentes). Ninguna ficha publica codigo de
 *     barras ni stock numerico; la descripcion del listado viene vacia.
 *   - Imagenes en static.zara.net: `{path}/{name}.jpg`. Sin parametros sirve
 *     la original (2048x3072, ~500 KB); con `?w=750` la de grilla (~50 KB).
 *     El `ts=` que trae la API es la marca del asset: se quita para que una
 *     resubida sin cambio visual no ensucie el hash.
 *   - La url publica es `/{seo.keyword}-p{seoProductId}.html`, sin `?v1=`
 *     (el sitio lo agrega al hacer clic pero el enlace canonico no lo lleva).
 *     Verificado 14/14 contra los href reales de Mujer > Jeans.
 *   - Los nodos con `redirectCategoryId` (PANTALONES -> su VER TODO)
 *     devuelven bytes identicos al destino: son alias. Se recorre el destino
 *     y se publica el nodo visible.
 *
 * ---------------------------------------------------------------------------
 * Que se recorre: las "familias", no las 1 084 hojas
 * ---------------------------------------------------------------------------
 * El arbol tiene 1 084 categorias con productos (tras seguir alias), muchas
 * de ellas cortes finos (JEANS > BARREL, > WIDE LEG, > TIRO ALTO...). Pedirlas
 * todas serian ~1 100 peticiones por corrida. En cambio, la **familia**
 * (JEANS) cubre a sus cortes: medido en Mujer > Jeans, 189 de 190 modelos de
 * los 11 cortes estan en la familia. Se recorren entonces solo las familias:
 * las hijas con productos de cada grupo del menu (COLECCIÓN, ZAPATOS |
 * ACCESORIOS, NOVEDADES, SPECIAL EDITION, COLLABS...). Los cortes se
 * publican en el arbol de la tienda pero no se recorren.
 *
 * Raices y costo medido el 2026-09-19 (peticiones / MB sin comprimir /
 * segundos en frio, ~1 s por MB):
 *
 *   Mujer  1881757                                   25 req   54 MB   ~55 s
 *   Hombre 1885841                                   37 req   53 MB   ~60 s
 *   Niños  2425905 NIÑA 6-14, 2426469 NIÑO 6-14,
 *          2421860 NIÑA 1½-6, 2422499 NIÑO 1½-6,
 *          2428025 BEBÉ 0-18m                       146 req  170 MB  ~200 s
 *          ... con `includeGenericListings: false`  118 req  109 MB  ~120 s
 *
 * A eso se suma la ingesta (~10 s por cada 1 000 modelos). Medido por el
 * runner: Mujer 53 s, Hombre 99 s, Niños completo 247 s -> se paso del
 * presupuesto de 240 s y quedo `partial`. Por eso el target de Niños apaga
 * los listados genericos: pierde 44 modelos de 3 776 (1,2 %, los que solo
 * estan en VER TODO / THE NEW) y baja a ~165 s. En Mujer y Hombre se dejan:
 * VER TODO de hombre aporta 185 modelos que ninguna familia lista (8 %).
 *
 * Total: 10 356 modelos (24 000 producto-color). Los tres targets son
 * independientes; el catalogo entero (~300 s solo de descarga) no cabe en
 * una corrida y por eso no hay `full_catalog`.
 *
 * Las otras dos raices de NIÑOS no se recorren a proposito: ACCESORIOS |
 * ZAPATOS (2435024) y KDPT Goods (2645264) son vistas transversales de las
 * cinco raices por edad y aportan 0 y 1 modelo nuevo respectivamente
 * (medido). Recorrerlas costaria 37 MB mas por corrida para nada.
 *
 * ---------------------------------------------------------------------------
 * A que categoria pertenece cada modelo (y por que no cambia entre corridas)
 * ---------------------------------------------------------------------------
 * Un modelo aparece en varias familias (Novedades y Coleccion, o Niña 1½-6 y
 * Bebe: 626 modelos en comun). Como la ingesta pisa `store_category_id` con
 * lo que manda el ultimo target, hace falta una regla estable:
 *
 *   1. Dentro de un target, el modelo va a la **primera familia en la que
 *      aparece**, con las familias en orden de menu y los listados genericos
 *      (VER TODO, THE NEW, BEST SELLERS, SPECIAL PRICES, LOOKS y los grupos
 *      NOVEDADES / sin nombre) al final: son contenedores, no categorias.
 *   2. Entre targets, cada componente trae `sectionName` (WOMAN / MAN / KID),
 *      intrinseco al modelo. Un target solo emite los modelos de la seccion
 *      de sus raices. Medido sobre los 10 356: ninguno tiene mas de una
 *      seccion y todos aparecen bajo una raiz de su propia seccion, asi que
 *      el filtro es exacto y no pierde nada. Los 29 modelos que Mujer y
 *      Hombre comparten se resuelven asi sin costo; las cinco raices de
 *      niños se solapan entre si (hasta 915 modelos ya vistos en una raiz
 *      anterior) y por eso van juntas en UN target, donde el orden de
 *      familias las resuelve.
 *
 * Con esto no hace falta un indice de exclusion como el de Metromedia, que
 * aqui costaria releer hasta 170 MB por target.
 */

// -----------------------------------------------------------------------------
// Tipos de la respuesta de la tienda
// -----------------------------------------------------------------------------

export interface ZaraCategoryNode {
  id: number;
  key?: string;
  name?: string;
  sectionName?: string;
  layout?: string;
  redirectCategoryId?: number;
  subcategories?: ZaraCategoryNode[];
  seo?: { seoCategoryId?: number; keyword?: string; isHiddenInMenu?: boolean };
  attributes?: { isDivider?: boolean };
}

interface ZaraCategoriesResponse {
  categories?: ZaraCategoryNode[];
}

interface ZaraXmedia {
  type?: string;
  path?: string;
  name?: string;
  width?: number;
  height?: number;
}

interface ZaraColor {
  id?: string;
  productId?: number;
  name?: string;
  price?: number;
  oldPrice?: number;
  availability?: string;
  reference?: string;
  canonicalReference?: string;
  xmedia?: ZaraXmedia[];
}

export interface ZaraComponent {
  id?: number;
  reference?: string;
  type?: string;
  kind?: string;
  name?: string;
  description?: string;
  price?: number;
  oldPrice?: number;
  displayDiscountPercentage?: number;
  section?: number;
  sectionName?: string;
  familyName?: string;
  subfamilyName?: string;
  brand?: { brandGroupCode?: string };
  detail?: { reference?: string; displayReference?: string; colors?: ZaraColor[] };
  seo?: { keyword?: string; seoProductId?: string; discernProductId?: number };
  availability?: string;
  tagTypes?: Array<{ displayName?: string; type?: string }>;
  availableColors?: Array<{ colorName?: string; hexColor?: string }>;
}

interface ZaraProductsResponse {
  productGroups?: Array<{
    elements?: Array<{ commercialComponents?: ZaraComponent[] }>;
  }>;
}

// -----------------------------------------------------------------------------
// Configuracion
// -----------------------------------------------------------------------------

interface ZaraConfig {
  webBaseUrl: string;
  /** Prefijo de pais/idioma de las urls publicas y de la API (/hn/es). */
  storePath: string;
  /** Raices del menu a recorrer. Obligatorio. */
  rootCategoryIds: number[];
  /** Ancho con el que se guardan las imagenes (`?w=`); 0 = original. */
  imageWidth: number;
  /**
   * Si se recorren tambien los listados contenedores (VER TODO, THE NEW,
   * BEST SELLERS, SPECIAL PRICES, LOOKS). Solo completan: van al final y
   * nunca deciden la categoria de un modelo que este en una familia real.
   */
  includeGenericListings: boolean;
}

const DEFAULTS: ZaraConfig = {
  webBaseUrl: 'https://www.zara.com',
  storePath: '/hn/es',
  rootCategoryIds: [],
  imageWidth: 750,
  includeGenericListings: true,
};

const STATIC_HOST = 'https://static.zara.net';
/** Tope duro de peticiones por corrida; Niños usa ~147 (arbol + 146 familias). */
const MAX_PAGES_HARD_LIMIT = 250;
const MAX_IMAGES = 6;

/** Listados que son contenedores, no categorias: van al final de la prioridad. */
const GENERIC_LISTING = /^(VER TODO|BEST SELLERS|THE NEW|SPECIAL PRICES|NOVEDADES|LOOKS)$/i;

// -----------------------------------------------------------------------------
// Arbol de categorias (exportado para probarlo sin red)
// -----------------------------------------------------------------------------

function isProductView(node: ZaraCategoryNode): boolean {
  return typeof node.layout === 'string' && node.layout.includes('products-category-view');
}

function isDivider(node: ZaraCategoryNode): boolean {
  return node.layout === 'divider-category-view' || node.attributes?.isDivider === true;
}

/** Nombre del nodo tal como lo muestra el menu (mayusculas, con acentos). */
function nodeName(node: ZaraCategoryNode): string {
  return (node.name ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * NIÑOS tiene dos raices "NIÑA" y dos "NIÑO": las de 6-14 años y las de
 * 1½-6, que Zara distingue solo por la clave (`...-BEBENINA`) y la palabra
 * clave seo (`ninos-bebe-nina`). Se les antepone BEBÉ para que el arbol no
 * tenga dos categorias con el mismo nombre bajo el mismo padre.
 */
export function zaraRootLabel(node: ZaraCategoryNode): string {
  const name = nodeName(node);
  const isBaby = /bebe/i.test(node.seo?.keyword ?? '') || /BEBE/i.test(node.key ?? '');
  return isBaby && !/BEB[EÉ]/i.test(name) ? `BEBÉ ${name}` : name;
}

export function findZaraNode(roots: ZaraCategoryNode[], id: number): { node: ZaraCategoryNode; ancestors: ZaraCategoryNode[] } | null {
  const walk = (nodes: ZaraCategoryNode[], ancestors: ZaraCategoryNode[]): ReturnType<typeof findZaraNode> => {
    for (const node of nodes) {
      if (node.id === id) return { node, ancestors };
      const found = walk(node.subcategories ?? [], [...ancestors, node]);
      if (found) return found;
    }
    return null;
  };
  return walk(roots, []);
}

export interface ZaraFamily {
  /** Id que se pide a la API: el destino del alias si lo hay. */
  fetchId: number;
  /** Nodo visible del menu (el que se publica como categoria). */
  node: ZaraCategoryNode;
  /** Grupo del menu al que pertenece (COLECCIÓN...), o null si el grupo no tiene nombre. */
  group: ZaraCategoryNode | null;
  root: ZaraCategoryNode;
  /** Ruta legible desde la seccion: ["NIÑOS", "BEBÉ NIÑA", "COLECCIÓN", "PANTALONES"]. */
  path: string[];
  /** Contenedor (VER TODO, THE NEW...): se recorre al final, solo para completar. */
  generic: boolean;
}

/**
 * Familias de una raiz en orden de prioridad: grupos con nombre y no
 * genericos en orden de menu, dentro de cada uno sus hijas con productos
 * (las genericas al final); despues los grupos genericos y sin nombre. Los
 * alias (`redirectCategoryId`) se deduplican por destino: el primero gana.
 */
export function zaraFamilies(root: ZaraCategoryNode, ancestors: ZaraCategoryNode[] = []): ZaraFamily[] {
  const prefix = [...ancestors.map(nodeName), zaraRootLabel(root)];
  const groups = (root.subcategories ?? []).filter((g) => !isDivider(g));
  const isGenericGroup = (g: ZaraCategoryNode) => nodeName(g) === '' || GENERIC_LISTING.test(nodeName(g));
  const ordered = [...groups.filter((g) => !isGenericGroup(g)), ...groups.filter(isGenericGroup)];

  const families: ZaraFamily[] = [];
  const seen = new Set<number>();
  for (const group of ordered) {
    const children = (group.subcategories ?? []).filter((c) => isProductView(c) && !isDivider(c));
    const isGeneric = (c: ZaraCategoryNode) => isGenericGroup(group) || GENERIC_LISTING.test(nodeName(c));
    const sorted = [...children.filter((c) => !isGeneric(c)), ...children.filter(isGeneric)];
    for (const child of sorted) {
      const fetchId = child.redirectCategoryId ?? child.id;
      if (seen.has(fetchId)) continue;
      seen.add(fetchId);
      const named = nodeName(group) ? group : null;
      families.push({
        fetchId,
        node: child,
        group: named,
        root,
        path: [...prefix, ...(named ? [nodeName(named)] : []), nodeName(child)],
        generic: isGeneric(child),
      });
    }
  }
  return families;
}

export function buildZaraCategoryUrl(node: ZaraCategoryNode, base: string): string | null {
  const keyword = node.seo?.keyword;
  const seoId = node.seo?.seoCategoryId;
  return keyword && seoId ? `${base}/${keyword}-l${seoId}.html` : null;
}

/**
 * Arbol que se publica: los ancestros de cada raiz, la raiz, sus grupos con
 * nombre y sus familias (nivel = profundidad). Los cortes finos bajo cada
 * familia no se publican: no se recorren y nada se atribuye a ellos.
 */
export function zaraCategoriesForRoots(
  tree: ZaraCategoryNode[],
  rootIds: number[],
  base: string,
): { categories: NormalizedCategory[]; families: ZaraFamily[]; missing: number[] } {
  const categories = new Map<string, NormalizedCategory>();
  const families: ZaraFamily[] = [];
  const missing: number[] = [];

  const put = (node: ZaraCategoryNode, name: string, parent: ZaraCategoryNode | null, level: number, position: number) => {
    const id = String(node.id);
    if (categories.has(id)) return;
    categories.set(id, {
      external_id: id,
      name,
      external_parent_id: parent ? String(parent.id) : null,
      slug: node.seo?.keyword ?? null,
      url: buildZaraCategoryUrl(node, base),
      level,
      position,
    });
  };

  for (const rootId of rootIds) {
    const found = findZaraNode(tree, rootId);
    if (!found) {
      missing.push(rootId);
      continue;
    }
    const { node: root, ancestors } = found;
    ancestors.forEach((a, i) => put(a, nodeName(a), i > 0 ? ancestors[i - 1] : null, i, 0));
    const rootParent = ancestors[ancestors.length - 1] ?? null;
    put(root, zaraRootLabel(root), rootParent, ancestors.length, 0);

    let position = 0;
    for (const family of zaraFamilies(root, ancestors)) {
      const parent = family.group ?? root;
      if (family.group) put(family.group, nodeName(family.group), root, ancestors.length + 1, 0);
      put(family.node, nodeName(family.node), parent, ancestors.length + (family.group ? 2 : 1), position);
      position += 1;
      families.push(family);
    }
  }

  return { categories: [...categories.values()], families, missing };
}

// -----------------------------------------------------------------------------
// Productos (exportado para probarlo sin red)
// -----------------------------------------------------------------------------

export function zaraComponents(response: ZaraProductsResponse): ZaraComponent[] {
  const out: ZaraComponent[] = [];
  for (const group of response.productGroups ?? []) {
    for (const element of group.elements ?? []) {
      for (const component of element.commercialComponents ?? []) out.push(component);
    }
  }
  return out;
}

/** 149500 -> 1495; null si no hay precio. */
export function zaraPrice(cents: unknown): number | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return null;
  return Math.round(cents) / 100;
}

export function mapZaraAvailability(value: string | undefined): AvailabilityStatus {
  switch (value) {
    case 'in_stock':
      return 'in_stock';
    case 'out_of_stock':
      return 'out_of_stock';
    case 'coming_soon':
      return 'preorder';
    case 'low_on_stock':
    case 'few_units':
      return 'limited';
    default:
      return 'unknown';
  }
}

export function buildZaraProductUrl(component: ZaraComponent, base: string): string | null {
  const keyword = component.seo?.keyword;
  const seoId = component.seo?.seoProductId;
  return keyword && seoId ? `${base}/${keyword}-p${seoId}.html` : null;
}

function imageUrl(media: ZaraXmedia, width: number): string | null {
  if (!media.path || !media.name) return null;
  return `${STATIC_HOST}${media.path}/${media.name}.jpg${width > 0 ? `?w=${width}` : ''}`;
}

/** "12710830500-I2026" -> "12710830500": modelo + color, sin temporada. */
function variantId(color: ZaraColor, component: ZaraComponent): string | null {
  const canonical = color.canonicalReference?.split('-')[0];
  if (canonical) return canonical;
  const model = component.seo?.seoProductId;
  return model && color.id ? `${model}${color.id}` : null;
}

interface ZaraVariantDraft extends NormalizedVariant {
  external_id: string;
  images: NormalizedImage[];
}

function draftVariant(component: ZaraComponent, color: ZaraColor, width: number): ZaraVariantDraft | null {
  const id = variantId(color, component);
  if (!id) return null;
  const price = zaraPrice(color.price ?? component.price);
  const old = zaraPrice(color.oldPrice ?? component.oldPrice);
  const availability = mapZaraAvailability(color.availability ?? component.availability);
  const images: NormalizedImage[] = [];
  for (const media of color.xmedia ?? []) {
    if (media.type !== 'image') continue;
    const url = imageUrl(media, width);
    if (!url || images.some((i) => i.url === url)) continue;
    images.push({
      url,
      external_id: media.name ?? null,
      position: images.length,
      is_primary: images.length === 0,
      alt_text: component.name ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
    });
    if (images.length >= MAX_IMAGES) break;
  }
  const hex = component.availableColors?.find((c) => c.colorName === color.name)?.hexColor ?? null;
  return {
    external_id: id,
    // La referencia completa lleva el styling (...811000 vs ...811015), que cambia
    // sin que cambie el articulo; la canonica es modelo+color+temporada.
    sku: color.canonicalReference ?? color.reference ?? null,
    color: color.name ?? null,
    price,
    // El listado repite el precio en `oldPrice` solo cuando hay rebaja; igual se comprueba.
    list_price: old !== null && price !== null && old > price ? old : null,
    availability,
    in_stock: availability === 'in_stock',
    image_url: images[0]?.url ?? null,
    options: hex ? { hex } : {},
    images,
  };
}

/**
 * Acumula los componentes (producto-color) de un mismo modelo. Se llama una
 * vez por componente, en el orden de prioridad de los listados; el primer
 * listado en que aparece el modelo decide su categoria.
 */
export interface ZaraModelDraft {
  component: ZaraComponent;
  category: ZaraFamily | null;
  variants: Map<string, ZaraVariantDraft>;
}

export function accumulateZaraComponent(
  drafts: Map<string, ZaraModelDraft>,
  component: ZaraComponent,
  category: ZaraFamily | null,
  width: number,
): void {
  if (component.type !== 'Product') return;
  const model = component.seo?.seoProductId;
  if (!model || !component.name) return;

  let draft = drafts.get(model);
  if (!draft) {
    draft = { component, category, variants: new Map() };
    drafts.set(model, draft);
  }
  for (const color of component.detail?.colors ?? []) {
    const variant = draftVariant(component, color, width);
    if (variant && !draft.variants.has(variant.external_id)) draft.variants.set(variant.external_id, variant);
  }
}

/** Traduce un modelo acumulado al contrato comun del sistema. */
export function mapZaraModel(draft: ZaraModelDraft, base: string, currency: string): NormalizedProduct | null {
  const { component } = draft;
  const model = component.seo?.seoProductId;
  const url = buildZaraProductUrl(component, base);
  if (!model || !component.name || !url) return null;

  // Orden estable: el color de menor referencia representa al modelo, sin
  // importar en que listado ni en que posicion salio esta vez.
  const variants = [...draft.variants.values()].sort((a, b) => a.external_id.localeCompare(b.external_id));
  const priced = variants.filter((v) => v.price !== null);
  const cheapest = priced.length > 0 ? priced.reduce((a, b) => (b.price! < a.price! ? b : a)) : null;
  const representative = cheapest ?? variants[0] ?? null;
  const prices = priced.map((v) => v.price!);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  const price = representative?.price ?? zaraPrice(component.price);
  const listPrice = representative?.list_price ?? null;
  const inStock = variants.some((v) => v.in_stock);
  const availability: AvailabilityStatus = inStock
    ? 'in_stock'
    : (variants.find((v) => v.availability !== 'unknown')?.availability ?? mapZaraAvailability(component.availability));

  const colors = [...new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c)))].sort();
  const tags = [...new Set((component.tagTypes ?? []).map((t) => t.displayName ?? t.type).filter((t): t is string => Boolean(t)))].sort();
  const name = component.name.replace(/\s+/g, ' ').trim();

  return {
    external_id: model,
    name,
    url,
    external_code: component.detail?.displayReference ?? null,
    slug: component.seo?.keyword ?? null,
    brand_raw: 'Zara',
    model: component.detail?.displayReference ?? null,
    color: representative?.color ?? null,
    condition: 'new',

    store_category_external_id: draft.category ? String(draft.category.node.id) : null,
    category_raw: draft.category ? nodeName(draft.category.node) : null,
    category_path: draft.category ? draft.category.path : [],
    tags,

    currency,
    price,
    list_price: listPrice,
    discount_amount: listPrice !== null && price !== null ? Number((listPrice - price).toFixed(2)) : null,
    discount_percent:
      listPrice !== null && price !== null
        ? (component.displayDiscountPercentage ?? Number((((listPrice - price) / listPrice) * 100).toFixed(2)))
        : null,
    min_price: minPrice !== null && maxPrice !== null && minPrice !== maxPrice ? minPrice : null,
    max_price: minPrice !== null && maxPrice !== null && minPrice !== maxPrice ? maxPrice : null,
    tax_included: true,

    availability,
    in_stock: inStock,

    primary_image_url: representative?.images[0]?.url ?? null,
    images: representative?.images ?? [],

    specs: {
      section: component.sectionName ?? null,
      family: component.familyName ?? null,
      subfamily: component.subfamilyName ?? null,
    },
    attributes: {
      reference: component.reference ?? null,
      kind: component.kind ?? null,
      colors,
    },
    badges: tags,
    variants: variants.map((v) => ({
      external_id: v.external_id,
      sku: v.sku,
      color: v.color,
      price: v.price,
      list_price: v.list_price,
      availability: v.availability,
      in_stock: v.in_stock,
      image_url: v.image_url,
      options: v.options,
    })),
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): ZaraConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const idsRaw = raw.rootCategoryIds;
  const ids = Array.isArray(idsRaw)
    ? idsRaw
    : typeof idsRaw === 'string' || typeof idsRaw === 'number'
      ? String(idsRaw).split(',')
      : [];
  const rootCategoryIds = ids.map((v) => Number(String(v).trim())).filter((n) => Number.isInteger(n) && n > 0);
  const width = Number(raw.imageWidth);
  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    storePath: `/${str('storePath', DEFAULTS.storePath).replace(/^\/+|\/+$/g, '')}`,
    rootCategoryIds,
    imageWidth: Number.isFinite(width) && width >= 0 ? Math.round(width) : DEFAULTS.imageWidth,
    includeGenericListings: raw.includeGenericListings !== false && raw.includeGenericListings !== 'false',
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const zaraStrategy: ScrapeStrategy = {
  key: 'zara',
  label: 'Zara (API JSON)',
  // Sin full_catalog a proposito: ~300 s de listados no caben en una corrida.
  supports: ['category'],
  configSchema: [
    {
      key: 'rootCategoryIds',
      label: 'Raices del menu',
      required: true,
      example: '2425905,2426469,2421860,2422499,2428025',
      description:
        'Ids de /categories?ajax=true. Mujer 1881757; Hombre 1885841; Niños las cinco raices por edad juntas (se solapan entre si y solo un target las atribuye de forma estable). Todas tienen que ser de la misma seccion.',
    },
    {
      key: 'storePath',
      label: 'Prefijo de pais/idioma',
      example: '/hn/es',
      description: 'Va delante de /categories, /category/{id}/products y de las urls publicas.',
    },
    {
      key: 'imageWidth',
      label: 'Ancho de imagen',
      example: '750',
      description: 'Se guarda static.zara.net/...jpg?w={ancho}. 0 guarda la original (2048x3072, ~500 KB).',
    },
    {
      key: 'includeGenericListings',
      label: 'Recorrer VER TODO / THE NEW',
      example: 'false',
      description:
        'Los listados contenedores solo completan (van al final). En Niños cuestan 61 MB y ~60 s por 44 modelos: apagarlos deja la corrida en ~160 s en vez de ~250.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);
    const base = `${config.webBaseUrl}${config.storePath}`;

    let pagesFetched = 0;

    async function fetchJson<T>(url: string, stage: string): Promise<T | null> {
      if (ctx.signal.aborted) {
        errors.push({ stage, message: 'Corrida abortada por limite de tiempo', meta: { url } });
        return null;
      }
      if (pagesFetched >= maxPages) {
        errors.push({ stage, message: `Tope de ${maxPages} peticiones alcanzado`, meta: { url } });
        return null;
      }
      try {
        const data = await ctx.http.getJson<T>(url);
        pagesFetched += 1;
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage, message, meta: { url } });
        if (error instanceof HttpError && error.status === 403) {
          ctx.log(
            'error',
            'Akamai rechazo la peticion (403). Zara solo responde a user agents de navegador: revisa stores.user_agent.',
            { url, userAgent: ctx.store.user_agent },
          );
        } else {
          ctx.log('error', `Fallo ${url}: ${message}`);
        }
        return null;
      }
    }

    if (config.rootCategoryIds.length === 0) {
      errors.push({ stage: 'config', message: 'Falta rootCategoryIds: esta tienda se recorre por raices del menu' });
      return { products: [], pagesFetched, errors };
    }

    // 1. El arbol entero (~900 KB): de ahi salen las familias y las categorias.
    const treeResponse = await fetchJson<ZaraCategoriesResponse>(`${base}/categories?ajax=true`, 'categories');
    const tree = treeResponse?.categories ?? [];
    if (tree.length === 0) {
      if (errors.length === 0) errors.push({ stage: 'categories', message: 'El arbol de categorias vino vacio' });
      return { products: [], pagesFetched, errors };
    }

    const planned = zaraCategoriesForRoots(tree, config.rootCategoryIds, base);
    const { categories, missing } = planned;
    const families = config.includeGenericListings ? planned.families : planned.families.filter((f) => !f.generic);
    if (missing.length > 0) {
      errors.push({ stage: 'config', message: `Raices que no existen en el arbol: ${missing.join(', ')}` });
    }
    if (families.length === 0) {
      return { products: [], pagesFetched, categories, errors };
    }

    // 2. La seccion del target la fijan sus raices; un modelo de otra seccion
    //    que aparezca en estos listados pertenece a otro target.
    const sections = new Set(families.map((f) => f.root.sectionName).filter(Boolean));
    if (sections.size !== 1) {
      errors.push({ stage: 'config', message: `Las raices mezclan secciones (${[...sections].join(', ')}): un target atiende una sola` });
      return { products: [], pagesFetched, categories, errors };
    }
    const [section] = sections;
    const omitted = planned.families.length - families.length;
    ctx.log(
      'info',
      `Seccion ${section}: ${families.length} familias en ${config.rootCategoryIds.length} raices` +
        (omitted > 0 ? ` (${omitted} listados genericos omitidos)` : ''),
    );

    // 3. Una peticion por familia, en orden de prioridad. Una familia caida se
    //    anota y se sigue: el target es de categoria, no da de baja nada.
    const drafts = new Map<string, ZaraModelDraft>();
    const perFamily: Record<string, number> = {};
    let foreign = 0;
    let marketing = 0;
    for (const family of families) {
      const response = await fetchJson<ZaraProductsResponse>(`${base}/category/${family.fetchId}/products?ajax=true`, 'family');
      if (response === null) {
        if (ctx.signal.aborted) break;
        continue;
      }
      const components = zaraComponents(response);
      let own = 0;
      for (const component of components) {
        if (component.type !== 'Product') {
          marketing += 1;
          continue;
        }
        if (component.sectionName && component.sectionName !== section) {
          foreign += 1;
          continue;
        }
        own += 1;
        accumulateZaraComponent(drafts, component, family, config.imageWidth);
      }
      perFamily[`${family.group ? `${nodeName(family.group)} > ` : ''}${nodeName(family.node)}`] = own;
    }

    // 4. Traducir.
    const products: NormalizedProduct[] = [];
    for (const draft of drafts.values()) {
      const mapped = mapZaraModel(draft, base, currency);
      if (mapped) products.push(mapped);
    }

    const variants = products.reduce((n, p) => n + (p.variants?.length ?? 0), 0);
    ctx.log('info', `${products.length} modelos (${variants} colores) en ${pagesFetched} peticiones; ${foreign} de otra seccion, ${marketing} banners`);

    return {
      products,
      categories,
      pagesFetched,
      totalReported: products.length,
      errors,
      stats: { section, roots: config.rootCategoryIds, families: families.length, perFamily, variants, foreign, marketing },
    };
  },
};
