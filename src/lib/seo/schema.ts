import { SITE_DESCRIPTION, siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import type { AvailabilityStatus } from "@/server/scraping/types";
import type { ProductDetail } from "@/server/services/catalog";
import type { Product } from "@/types";
import { absoluteUrl } from "./metadata";

/**
 * Datos estructurados (schema.org) del sitio.
 *
 * Esto es la parte del SEO que de verdad cambia cómo se ve el sitio en Google.
 * Las etiquetas `<meta>` influyen en el ranking; el JSON-LD es lo que hace que
 * un resultado de producto salga con precio, disponibilidad y estrellas en vez
 * de con dos líneas de texto gris. En un comparador esa diferencia es el clic.
 *
 * Regla que se sigue en todo el módulo: **no se declara lo que no se sabe**.
 * Un `aggregateRating` inventado o un `priceValidUntil` que no corresponde a
 * nada real son motivo de sanción manual por spam de datos estructurados, y
 * además serían mentira. Cada campo opcional se emite sólo si hay dato.
 */

/** Identificadores estables. Permiten que un nodo referencie a otro con `@id`. */
const ORG_ID = `${siteConfig.url}/#organization`;
const WEBSITE_ID = `${siteConfig.url}/#website`;

/** Tipo laxo a propósito: schema.org es un grafo abierto, no una interfaz. */
export type JsonLdNode = Record<string, unknown>;

/** Quita las claves sin valor para no emitir `"sku": null` en el grafo. */
function compact(node: JsonLdNode): JsonLdNode {
  return Object.fromEntries(
    Object.entries(node).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

/**
 * La entidad detrás del sitio.
 *
 * Es `Organization` y no `OnlineStore`: acá no se vende nada. Declararse
 * tienda cuando no se despacha ni un producto invita a que Google espere
 * políticas de envío y devolución que no existen, y a que marque la ficha como
 * incompleta.
 */
export function organizationJsonLd(locale: Locale): JsonLdNode {
  return compact({
    "@type": "Organization",
    "@id": ORG_ID,
    name: siteConfig.name,
    alternateName: siteConfig.shortName,
    url: siteConfig.url,
    description: SITE_DESCRIPTION[locale],
    email: siteConfig.contactEmail,
    logo: compact({
      "@type": "ImageObject",
      url: absoluteUrl("/icon.svg"),
      contentUrl: absoluteUrl("/icon.svg"),
      caption: siteConfig.name,
    }),
    areaServed: {
      "@type": "Country",
      name: siteConfig.countryName,
      identifier: siteConfig.country,
    },
    founder: siteConfig.creators.map((creator) => ({
      "@type": "Person",
      name: creator.nick,
      url: creator.url,
    })),
    sameAs: siteConfig.sameAs,
    contactPoint: {
      "@type": "ContactPoint",
      email: siteConfig.contactEmail,
      contactType: locale === "es" ? "Atención al público" : "Customer support",
      availableLanguage: ["es", "en"],
    },
  });
}

/** El sitio como obra: nombre, idioma y a quién pertenece. */
export function websiteJsonLd(locale: Locale): JsonLdNode {
  return compact({
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: siteConfig.name,
    url: siteConfig.url,
    description: SITE_DESCRIPTION[locale],
    inLanguage: locale === "es" ? "es-HN" : "en",
    publisher: { "@id": ORG_ID },
    // Sin `potentialAction`/SearchAction a propósito: la búsqueda del catálogo
    // vive en el estado del componente, no en la URL, así que no hay dirección
    // a la que un buscador pudiera mandar una consulta. Declarar una que no
    // funciona es peor que no declarar ninguna. (Google además retiró la caja
    // de búsqueda de enlaces de sitio a finales de 2024.)
  });
}

export interface BreadcrumbItem {
  name: string;
  /** Ruta del sitio, relativa. Se absolutiza acá. */
  path: string;
}

/**
 * Migas de pan.
 *
 * Google las usa para reemplazar la URL cruda del resultado por una ruta
 * legible ("findyourprices.com › Productos › Televisores"). Vale la pena
 * aunque la navegación visible no muestre migas.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * Disponibilidad de schema.org a partir del estado interno.
 *
 * El mapeo es explícito y no un `if (inStock)` porque "agotado" y
 * "descontinuado" no son lo mismo para un buscador: el primero puede volver y
 * el segundo no, y Google deja de mostrar el precio del segundo.
 */
const AVAILABILITY_SCHEMA: Record<AvailabilityStatus, string | undefined> = {
  in_stock: "https://schema.org/InStock",
  limited: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
  preorder: "https://schema.org/PreOrder",
  backorder: "https://schema.org/BackOrder",
  discontinued: "https://schema.org/Discontinued",
  // `unknown` no tiene equivalente en schema.org, y ahí está lo correcto: si el
  // scraper no pudo determinar la existencia, no se declara nada y se cae al
  // booleano de abajo. Inventar "InStock" para rellenar el campo es exactamente
  // el tipo de dato falso que hace que Google desconfíe de toda la ficha.
  unknown: undefined,
};

function availabilityUrl(product: ProductDetail): string | undefined {
  const fromStatus = AVAILABILITY_SCHEMA[product.availabilityStatus];
  if (fromStatus) return fromStatus;
  if (product.inStock === true) return "https://schema.org/InStock";
  if (product.inStock === false) return "https://schema.org/OutOfStock";
  return undefined;
}

/**
 * Condición del artículo. Casi todo el catálogo es nuevo, pero las tiendas
 * publican reacondicionados y el valor viene del scraper, así que se traduce
 * en vez de asumirse.
 */
function conditionUrl(condition?: string): string {
  switch (condition?.toLowerCase()) {
    case "used":
    case "usado":
      return "https://schema.org/UsedCondition";
    case "refurbished":
    case "reacondicionado":
      return "https://schema.org/RefurbishedCondition";
    case "damaged":
    case "dañado":
      return "https://schema.org/DamagedCondition";
    default:
      return "https://schema.org/NewCondition";
  }
}

/**
 * Horizonte de validez del precio.
 *
 * Google recomienda `priceValidUntil` y avisa cuando falta. Se calcula a
 * partir del último chequeo y no de una fecha lejana inventada: este precio no
 * es una promesa nuestra, es una lectura de la tienda con fecha. Una semana es
 * el plazo en que el scraper vuelve a pasar varias veces; más allá de eso el
 * dato ya no lo respaldamos.
 */
function priceValidUntil(product: ProductDetail): string | undefined {
  const lastSeen = Date.parse(product.lastSeenAt);
  if (!Number.isFinite(lastSeen)) return undefined;
  return new Date(lastSeen + 7 * 86_400_000).toISOString().slice(0, 10);
}

export interface ProductJsonLdOptions {
  product: ProductDetail;
  locale: Locale;
  /** Ruta de la ficha en el sitio (no la de la tienda). */
  path: string;
}

/**
 * Ficha de producto como `Product` + `Offer`.
 *
 * `offers.url` apunta a la tienda y no a nuestra ficha: la oferta es de la
 * tienda, nosotros sólo la mostramos. Poner acá nuestra propia URL sería
 * declarar que vendemos, que es justo lo que no hacemos.
 */
export function productJsonLd({ product, locale, path }: ProductJsonLdOptions): JsonLdNode {
  const url = absoluteUrl(path);
  const images = product.images.length
    ? product.images.map((image) => image.url)
    : product.imageUrl
      ? [product.imageUrl]
      : [];

  const offer = compact({
    "@type": "Offer",
    "@id": `${url}#offer`,
    url: product.url ?? url,
    priceCurrency: product.currency,
    price: product.price > 0 ? product.price.toFixed(2) : undefined,
    priceValidUntil: priceValidUntil(product),
    availability: availabilityUrl(product),
    itemCondition: conditionUrl(product.condition),
    seller: {
      "@type": "Organization",
      name: product.store,
    },
    areaServed: {
      "@type": "Country",
      name: siteConfig.countryName,
      identifier: siteConfig.country,
    },
  });

  // Sólo hay calificación si la tienda la publica y tiene al menos un voto:
  // un `ratingCount: 0` es una ficha de reseñas vacía, y Google la rechaza.
  const aggregateRating =
    product.ratingAverage && product.ratingCount && product.ratingCount > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: product.ratingAverage,
          reviewCount: product.ratingCount,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined;

  const specs = Object.entries(product.specs ?? {})
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .slice(0, 30)
    .map(([name, value]) => ({
      "@type": "PropertyValue",
      name,
      value: String(value),
    }));

  return compact({
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    url,
    description:
      product.description ??
      (locale === "es"
        ? `${product.name} en ${product.store}. Precio y disponibilidad actualizados en Find Your Prices.`
        : `${product.name} at ${product.store}. Price and availability tracked by Find Your Prices.`),
    image: images,
    sku: product.sku,
    mpn: product.model,
    gtin: product.gtin,
    color: product.color,
    size: product.size,
    category: product.categoryPath.length ? product.categoryPath.join(" > ") : product.category,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    weight:
      product.weightGrams && product.weightGrams > 0
        ? { "@type": "QuantitativeValue", value: product.weightGrams, unitCode: "GRM" }
        : undefined,
    additionalProperty: specs,
    aggregateRating,
    offers: offer,
    // `subjectOf` enlaza la ficha con la página que la describe, para que el
    // grafo diga qué documento habla de este producto.
    subjectOf: { "@id": `${url}#webpage` },
  });
}

/**
 * La página que muestra la ficha. Es un nodo aparte del producto a propósito:
 * `Product` describe el artículo, `ItemPage` describe el documento —cuándo se
 * actualizó, en qué idioma está, de quién es.
 */
export function productPageJsonLd({ product, locale, path }: ProductJsonLdOptions): JsonLdNode {
  const url = absoluteUrl(path);
  return compact({
    "@type": "ItemPage",
    "@id": `${url}#webpage`,
    url,
    name: product.name,
    inLanguage: locale === "es" ? "es-HN" : "en",
    isPartOf: { "@id": WEBSITE_ID },
    // El scraper anota cuándo vio la ficha por última vez; esa es la fecha
    // honesta de actualización de esta página, no la del despliegue.
    datePublished: product.firstSeenAt,
    dateModified: product.lastSeenAt,
    primaryImageOfPage: product.imageUrl
      ? { "@type": "ImageObject", url: product.imageUrl }
      : undefined,
    mainEntity: { "@id": `${url}#product` },
  });
}

/**
 * Listado de productos de la portada.
 *
 * Se emite como `ItemList` con URLs y no con fichas completas: repetir noventa
 * productos enteros en la portada infla el HTML sin que Google los indexe
 * mejor —las fichas ya viven en su propia página, que es donde las quiere.
 */
export function itemListJsonLd(
  products: Product[],
  locale: Locale,
  limit = 30,
): JsonLdNode {
  const productPath = locale === "es" ? "/p" : "/en/p";
  return {
    "@type": "ItemList",
    name:
      locale === "es"
        ? "Productos con precio actualizado"
        : "Products with up-to-date prices",
    numberOfItems: Math.min(products.length, limit),
    // Sin slug no hay ficha a la que apuntar (el fixture no los trae): se
    // omite la entrada en vez de emitir una URL que responde 404, que es una
    // señal peor que una lista más corta.
    itemListElement: products
      .slice(0, limit)
      .filter((product) => Boolean(product.slug))
      .map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: product.name,
        url: absoluteUrl(`${productPath}/${product.slug}`),
      })),
  };
}

/** Portada: es una `CollectionPage`, que es lo que describe un catálogo. */
export function collectionPageJsonLd(locale: Locale, path: string): JsonLdNode {
  const url = absoluteUrl(path);
  return compact({
    "@type": "CollectionPage",
    "@id": `${url}#webpage`,
    url,
    name: siteConfig.name,
    description: SITE_DESCRIPTION[locale],
    inLanguage: locale === "es" ? "es-HN" : "en",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
  });
}

/** Páginas de texto: "Acerca de" y las legales. */
export function contentPageJsonLd(options: {
  type: "AboutPage" | "WebPage";
  locale: Locale;
  path: string;
  name: string;
  description: string;
  breadcrumb?: BreadcrumbItem[];
}): JsonLdNode {
  const url = absoluteUrl(options.path);
  return compact({
    "@type": options.type,
    "@id": `${url}#webpage`,
    url,
    name: options.name,
    description: options.description,
    inLanguage: options.locale === "es" ? "es-HN" : "en",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
  });
}

/**
 * Empaqueta varios nodos en un solo `@graph`.
 *
 * Un único bloque con grafo, en vez de cinco `<script>` sueltos: así los nodos
 * pueden referenciarse por `@id` —el producto apunta a su página, la página al
 * sitio, el sitio a la organización— y Google lee una sola entidad coherente
 * en lugar de cinco islas sin relación.
 */
export function graph(nodes: (JsonLdNode | undefined)[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((node): node is JsonLdNode => Boolean(node)),
  };
}
