import type { Locale } from "@/features/i18n/translate";

/** Dominio de producción. Es el que vale si el entorno no dice otra cosa. */
const PRODUCTION_URL = "https://findyourprices.com";

/**
 * Origen del sitio.
 *
 * De acá salen las canónicas, los `hreflang`, el Open Graph, el `robots.txt` y
 * los sitemaps: es la dirección con la que el sitio se presenta ante los
 * buscadores. Sale del entorno para que un despliegue de vista previa no
 * publique canónicas apuntando al dominio real (ni al revés), pero cae al
 * dominio de producción cuando la variable no está.
 *
 * Cuidado con esto en Vercel: si `NEXT_PUBLIC_SITE_URL` se queda con la URL de
 * preview (`*.vercel.app`) en el entorno de producción, TODAS las canónicas
 * apuntan ahí y Google indexa el dominio equivocado. Es el error de
 * configuración más caro de esta lista.
 */
function resolveSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!fromEnv) return PRODUCTION_URL;

  try {
    // Sin barra final: todo el código de SEO concatena rutas que ya empiezan
    // con "/", y "https://sitio.com//producto/1" es otra URL para un buscador.
    return new URL(fromEnv).origin;
  } catch {
    return PRODUCTION_URL;
  }
}

/**
 * Datos del sitio que necesitan más de un módulo.
 *
 * Buena parte de esto existe para SEO: el título, la descripción y las
 * palabras clave que se emiten en cada página salen de acá, no de literales
 * repartidos por el árbol. Un comparador de precios vive o muere de la
 * búsqueda orgánica, así que estos textos son producto, no configuración.
 */
export const siteConfig = {
  name: "Find Your Prices",
  /** Nombre corto: pestañas del navegador, icono en el escritorio, manifest. */
  shortName: "FindYourPrices",
  description:
    "Compará precios de Diunsa, Walmart, Jetstereo, RadioShack, ACOSA, Lady Lee y Steren en un solo lugar. Catálogo de Honduras actualizado varias veces al día, con historial de precios.",
  url: resolveSiteUrl(),

  /** País y moneda del catálogo. Los usan el JSON-LD y el formato de precios. */
  country: "HN",
  countryName: "Honduras",
  currency: "HNL",

  /** El idioma sin prefijo en la URL. `/` es español; `/en` es inglés. */
  defaultLocale: "es" as Locale,
  locales: ["es", "en"] as const,

  /**
   * Dirección de contacto pública.
   *
   * La usan la página de privacidad y —lo importante— el procedimiento de
   * retiro de contenido: una tienda que quiera salir del comparador tiene que
   * poder escribir a algún lado. Un procedimiento de retiro sin buzón que lo
   * reciba no vale nada, así que esto tiene que apuntar a un correo que
   * alguien realmente lea.
   */
  contactEmail: "hola@findyourprices.com",

  /**
   * Identificador con el que el scraper se presenta ante las tiendas. Se
   * publica en la política de contenido para que cualquier sitio que prefiera
   * no aparecer pueda bloquearlo por su cuenta, sin esperar respuesta de nadie.
   * Debe coincidir con `DEFAULT_USER_AGENT` de server/scraping/http.ts.
   */
  botUserAgent: "FindYourPricesBot",

  /**
   * Quiénes hicieron esto. Se mencionan dentro del texto de "Acerca de", con
   * enlace a su perfil: el apodo de GitHub ya es la identidad pública de cada
   * uno y su perfil dice más que cualquier biografía inventada.
   */
  creators: [
    { nick: "crywhat7", url: "https://github.com/crywhat7" },
    { nick: "fq962", url: "https://github.com/fq962" },
  ] as const,

  /**
   * Tiendas rastreadas, por nombre comercial tal como la gente las busca.
   *
   * No es decorativo: alimenta las palabras clave y la descripción del sitio.
   * "precios diunsa" y "walmart honduras precios" son consultas reales con
   * volumen; el nombre genérico "comparador de precios" no lo es tanto.
   * Mantener esta lista al día cuando entre una tienda nueva.
   */
  stores: [
    "Diunsa",
    "Walmart Honduras",
    "Jetstereo",
    "RadioShack",
    "ACOSA",
    "Lady Lee",
    "Steren",
  ] as const,

  links: {
    // Rellena aquí los enlaces sociales / repos cuando existan.
  },

  /**
   * Perfiles públicos del proyecto. Van al campo `sameAs` del JSON-LD, que es
   * como Google enlaza el sitio con la entidad detrás. Vacío hasta que existan
   * de verdad: inventar perfiles que no existen es peor que no declarar
   * ninguno.
   */
  sameAs: [] as string[],

  /**
   * Códigos de verificación de las consolas de búsqueda.
   *
   * Salen del entorno, no del código: son específicos de cada despliegue y no
   * tienen por qué estar en el repositorio. Sin ellos definidos simplemente no
   * se emite la etiqueta, que es el comportamiento correcto —una etiqueta de
   * verificación vacía no verifica nada.
   */
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    bing: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
  },
} as const;

/** Descripción del sitio en cada idioma. La raíz de cada `<meta description>`. */
export const SITE_DESCRIPTION: Record<Locale, string> = {
  es: siteConfig.description,
  en: "Compare prices from Diunsa, Walmart, Jetstereo, RadioShack, ACOSA, Lady Lee and Steren in one place. Honduras catalog refreshed several times a day, with price history.",
};

/** Lema corto. Va en el OG de marca y en el manifest, donde no cabe la larga. */
export const SITE_TAGLINE: Record<Locale, string> = {
  es: "Todos los precios de Honduras en un solo lugar",
  en: "Every price in Honduras in one place",
};
