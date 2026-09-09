import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import type { SitePage } from "@/features/i18n/routes";

/**
 * Textos legales del sitio, en los dos idiomas.
 *
 * Tres documentos y no uno: los términos dicen qué es el servicio, la
 * privacidad dice qué se guarda de quien lo visita, y el uso de contenido dice
 * de dónde salen los datos y cómo pedir que se retiren. Son tres preguntas de
 * tres públicos distintos —usuario, autoridad, tienda—, y meterlas en una sola
 * página larga hace que la tercera, que es la que importa cuando una tienda
 * reclama, quede enterrada.
 *
 * Lo que se afirma acá describe lo que el sistema hace de verdad. Si cambia el
 * comportamiento del scraper (server/scraping/http.ts) o lo que se guarda en el
 * navegador (features/products/viewPreferences.ts y compareTray.ts), este
 * archivo cambia con ellos: una política que describe algo que ya no es cierto
 * es peor que no tener política.
 */

export type LegalDocId = Extract<SitePage, "terms" | "privacy" | "content">;

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface LegalDoc {
  title: string;
  lede: string;
  sections: LegalSection[];
}

/**
 * Fecha de la última revisión de los tres documentos. En ISO y sin hora: el
 * componente la formatea según el idioma, para que no haya un "9/9/2026" que
 * signifique cosas distintas a cada lado.
 */
export const POLICIES_UPDATED = "2026-09-09";

const EMAIL = siteConfig.contactEmail;
const BOT = siteConfig.botUserAgent;

// ---------------------------------------------------------------------------
// Español
// ---------------------------------------------------------------------------

const termsEs: LegalDoc = {
  title: "Términos de uso",
  lede: "Qué es Find Your Prices, qué podés esperar de él y qué no.",
  sections: [
    {
      heading: "1. Qué es este sitio",
      paragraphs: [
        "Find Your Prices es un comparador de precios informativo. Reúne información de productos publicada por tiendas de Honduras en sus propios sitios web y la presenta en un solo lugar para que puedas compararla.",
        "No somos una tienda. No vendemos, no distribuimos, no almacenamos ni enviamos productos, y no participamos en ninguna transacción entre vos y una tienda.",
      ],
    },
    {
      heading: "2. Los precios son referenciales",
      paragraphs: [
        "Los precios, descuentos y disponibilidad que ves acá son una copia de lo que la tienda publicó cuando revisamos su sitio, no una oferta nuestra. Pueden estar desactualizados, contener errores de la fuente o haber cambiado desde la última revisión.",
        "El precio válido es siempre el que muestra la tienda al momento de comprar. Verificá en la tienda antes de decidir.",
      ],
    },
    {
      heading: "3. Cómo se ordena lo que ves",
      paragraphs: [
        "El orden de los resultados lo determinan tu búsqueda, tus filtros y el criterio de orden que elijas. Ninguna tienda paga por aparecer, por aparecer antes, ni por aparecer con mejor calificación.",
        "El sitio muestra publicidad de terceros para cubrir sus costos. Esa publicidad está identificada como tal y no altera los resultados del comparador.",
      ],
    },
    {
      heading: "4. Uso permitido",
      paragraphs: ["Podés usar el sitio libremente para consultar y comparar precios. Lo que no está permitido:"],
      list: [
        "Extraer masivamente el contenido del sitio de forma automatizada para reproducirlo, revenderlo o construir un servicio equivalente.",
        "Intentar saturar, interrumpir o vulnerar la infraestructura del sitio.",
        "Presentar la información como propia o hacerse pasar por Find Your Prices.",
        "Usar el sitio para cualquier fin ilícito.",
      ],
    },
    {
      heading: "5. Enlaces a sitios de terceros",
      paragraphs: [
        "Los productos enlazan a las tiendas de origen. Lo que pase en esos sitios —precios, stock, condiciones de compra, envíos, devoluciones, garantías y tratamiento de tus datos— se rige por los términos de cada tienda, no por estos.",
      ],
    },
    {
      heading: "6. Sin garantías y límite de responsabilidad",
      paragraphs: [
        'El servicio se ofrece "tal cual", de forma gratuita y sin garantía de exactitud, disponibilidad ni continuidad. Podemos cambiarlo, suspenderlo o cerrarlo en cualquier momento.',
        "En la medida en que la ley lo permita, no respondemos por daños derivados del uso del sitio, de decisiones de compra tomadas con la información que muestra, ni de errores u omisiones en los datos de origen.",
      ],
    },
    {
      heading: "7. Cambios",
      paragraphs: [
        "Podemos actualizar estos términos. La fecha de la última revisión está al inicio de esta página; seguir usando el sitio después de un cambio significa que lo aceptás.",
      ],
    },
    {
      heading: "8. Ley aplicable y contacto",
      paragraphs: [
        "Estos términos se rigen por las leyes de la República de Honduras.",
        `Para cualquier consulta sobre este documento: ${EMAIL}.`,
      ],
    },
  ],
};

const privacyEs: LegalDoc = {
  title: "Privacidad",
  lede: "Qué se guarda de vos cuando usás el sitio. Respuesta corta: casi nada.",
  sections: [
    {
      heading: "1. No pedimos datos personales",
      paragraphs: [
        "Find Your Prices no tiene cuentas ni registro. No pedimos tu nombre, tu correo, tu teléfono ni tu dirección, y no tenemos formularios que los recojan.",
        "No vendemos, alquilamos ni compartimos información de nuestros visitantes, porque no la recogemos.",
      ],
    },
    {
      heading: "2. Lo que se guarda en tu navegador",
      paragraphs: [
        "Algunas preferencias se guardan en el almacenamiento local de tu propio dispositivo para que el sitio te recuerde entre visitas:",
      ],
      list: [
        "El tema claro u oscuro que elegiste.",
        "Cómo preferís ver el catálogo: lista, cuadrícula, galería o comparación, y el tamaño de las fichas.",
        "Los productos que apartaste en la bandeja de comparación.",
      ],
    },
    {
      heading: "",
      paragraphs: [
        "Esa información no sale de tu navegador: no viaja a nuestros servidores, no la podemos leer y desaparece si borrás los datos del sitio.",
      ],
    },
    {
      heading: "3. Publicidad de terceros",
      paragraphs: [
        "El sitio muestra anuncios de Google AdSense. Google y sus socios pueden usar cookies o identificadores para mostrar anuncios en función de tus visitas a este y a otros sitios.",
        "Podés desactivar la publicidad personalizada en la configuración de anuncios de Google (adssettings.google.com) o bloquear las cookies desde tu navegador. El sitio sigue funcionando igual.",
        "El uso que Google hace de esos datos se rige por sus propias políticas, no por esta.",
      ],
    },
    {
      heading: "4. Datos técnicos",
      paragraphs: [
        "Como cualquier sitio web, el servidor que lo aloja registra datos técnicos de las solicitudes —dirección IP, tipo de navegador, hora— para operar y proteger el servicio. No los usamos para identificar personas ni los cruzamos con otras fuentes.",
      ],
    },
    {
      heading: "5. Menores",
      paragraphs: [
        "El sitio no está dirigido a menores de 13 años y no recoge conscientemente información de ellos.",
      ],
    },
    {
      heading: "6. Cambios y contacto",
      paragraphs: [
        "Si esto cambia, se actualiza esta página y la fecha del encabezado.",
        `Dudas sobre privacidad: ${EMAIL}.`,
      ],
    },
  ],
};

const contentEs: LegalDoc = {
  title: "Uso de contenido y propiedad intelectual",
  lede: "De dónde salen los datos, con qué criterio los usamos y cómo pedir que los retiremos.",
  sections: [
    {
      heading: "1. De dónde salen los datos",
      paragraphs: [
        "La información de productos proviene de páginas públicas de tiendas que operan en Honduras: las mismas que cualquiera puede abrir en un navegador, sin contraseña y sin pagar.",
        "De cada producto tomamos lo mínimo necesario para identificarlo y compararlo: nombre, precio, precio anterior, disponibilidad, marca, categoría, una imagen y el enlace a la ficha original en la tienda.",
        "No copiamos catálogos completos, descripciones extensas, textos editoriales, reseñas de clientes ni ningún contenido creativo de las tiendas.",
      ],
    },
    {
      heading: "2. Para qué se usan",
      paragraphs: [
        "Para un fin informativo y referencial: permitir que una persona compare precios entre tiendas antes de comprar.",
        "Cada producto se muestra siempre acreditado a su tienda y con enlace directo a la ficha original. El comparador no reemplaza a la tienda: la señala. El tráfico termina en el sitio de la tienda, no acá.",
      ],
    },
    {
      heading: "3. Marcas, nombres e imágenes",
      paragraphs: [
        "Las marcas comerciales, nombres, logotipos e imágenes de producto pertenecen a sus respectivos titulares. Aparecen únicamente para identificar el producto o la tienda de la que proviene el precio: es un uso nominativo y descriptivo.",
        "Su aparición en este sitio no implica afiliación, patrocinio, aval ni relación comercial alguna con Find Your Prices, ni en un sentido ni en el otro.",
      ],
    },
    {
      heading: "4. Cómo accedemos a los sitios",
      paragraphs: ["Nos comprometemos a hacerlo sin causar molestia ni daño:"],
      list: [
        `Nuestro proceso automático se identifica siempre con el agente de usuario ${BOT}. No se disfraza de navegador ni de otro servicio.`,
        "Deja una pausa deliberada entre solicitudes para no cargar los servidores de la tienda.",
        "Si un servidor responde que está saturado o pide esperar, espera lo que le indiquen antes de reintentar.",
        "Sólo consulta contenido público. No crea cuentas, no inicia sesión, no elude autenticación, muros de pago ni medidas técnicas de protección.",
        "No accede a áreas privadas, administrativas ni a datos de clientes de ninguna tienda.",
      ],
    },
    {
      heading: "5. Si sos una tienda y no querés aparecer",
      paragraphs: [
        "No hace falta un reclamo legal, ni un abogado, ni una carta formal. Basta con pedirlo y lo hacemos.",
        `Escribí a ${EMAIL} indicando: el nombre de la tienda, el sitio web, si querés retirar productos concretos o la tienda completa, y desde qué correo o cargo hacés la solicitud.`,
        "Respondemos dentro de los 5 días hábiles siguientes y ejecutamos el retiro en ese mismo plazo. Retirar significa que la tienda y sus productos dejan de mostrarse y dejamos de revisar su sitio.",
        `También podés bloquearnos por tu cuenta y sin avisarnos: rechazá o bloqueá el agente de usuario ${BOT} desde tu servidor o tu archivo robots.txt. No intentamos eludir bloqueos.`,
      ],
    },
    {
      heading: "6. Si un dato está equivocado",
      paragraphs: [
        `Si un precio, una imagen o una disponibilidad no corresponden a lo que publica la tienda, escribinos a ${EMAIL} con el enlace del producto. Lo corregimos o lo quitamos.`,
        "Los datos se refrescan varias veces al día, así que un dato desactualizado suele corregirse solo en cuestión de horas.",
      ],
    },
    {
      heading: "7. Sobre este sitio",
      paragraphs: [
        "El diseño, el código, la organización del catálogo y los textos propios de Find Your Prices son nuestros. Lo demás pertenece a quien corresponda, como dice el punto 3.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const termsEn: LegalDoc = {
  title: "Terms of use",
  lede: "What Find Your Prices is, what you can expect from it, and what you cannot.",
  sections: [
    {
      heading: "1. What this site is",
      paragraphs: [
        "Find Your Prices is an informational price comparison service. It gathers product information published by stores in Honduras on their own websites and presents it in one place so you can compare it.",
        "We are not a store. We do not sell, distribute, stock or ship products, and we take no part in any transaction between you and a store.",
      ],
    },
    {
      heading: "2. Prices are indicative",
      paragraphs: [
        "The prices, discounts and availability shown here are a copy of what the store published when we last read its site — not an offer from us. They may be out of date, may carry errors from the source, or may have changed since.",
        "The price that counts is always the one the store shows at checkout. Check with the store before you decide.",
      ],
    },
    {
      heading: "3. How results are ordered",
      paragraphs: [
        "Result order is determined by your search, your filters and the sort option you pick. No store pays to appear, to appear first, or to appear better rated.",
        "The site shows third-party advertising to cover its costs. That advertising is labelled as such and does not alter comparison results.",
      ],
    },
    {
      heading: "4. Permitted use",
      paragraphs: ["You may use the site freely to look up and compare prices. What is not allowed:"],
      list: [
        "Bulk automated extraction of the site's content to republish it, resell it, or build an equivalent service.",
        "Attempting to overload, disrupt or breach the site's infrastructure.",
        "Passing the information off as your own or impersonating Find Your Prices.",
        "Using the site for any unlawful purpose.",
      ],
    },
    {
      heading: "5. Links to third-party sites",
      paragraphs: [
        "Products link out to their source stores. Whatever happens on those sites — prices, stock, purchase conditions, shipping, returns, warranties and the handling of your data — is governed by each store's own terms, not by these.",
      ],
    },
    {
      heading: "6. No warranty and limitation of liability",
      paragraphs: [
        'The service is provided "as is", free of charge, with no warranty of accuracy, availability or continuity. We may change, suspend or shut it down at any time.',
        "To the extent permitted by law, we are not liable for damages arising from use of the site, from purchasing decisions made on the information it shows, or from errors and omissions in the source data.",
      ],
    },
    {
      heading: "7. Changes",
      paragraphs: [
        "We may update these terms. The date of the latest revision is at the top of this page; continuing to use the site after a change means you accept it.",
      ],
    },
    {
      heading: "8. Governing law and contact",
      paragraphs: [
        "These terms are governed by the laws of the Republic of Honduras.",
        `Questions about this document: ${EMAIL}.`,
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: "Privacy",
  lede: "What we keep about you when you use the site. Short answer: almost nothing.",
  sections: [
    {
      heading: "1. We ask for no personal data",
      paragraphs: [
        "Find Your Prices has no accounts and no sign-up. We do not ask for your name, email, phone number or address, and we have no forms that collect them.",
        "We do not sell, rent or share visitor information, because we do not collect it.",
      ],
    },
    {
      heading: "2. What is stored in your browser",
      paragraphs: [
        "A few preferences are stored in your own device's local storage so the site remembers you between visits:",
      ],
      list: [
        "The light or dark theme you picked.",
        "How you prefer to view the catalogue — list, grid, gallery or comparison — and the card size.",
        "The products you set aside in the comparison tray.",
      ],
    },
    {
      heading: "",
      paragraphs: [
        "None of that leaves your browser: it never reaches our servers, we cannot read it, and it disappears if you clear the site's data.",
      ],
    },
    {
      heading: "3. Third-party advertising",
      paragraphs: [
        "The site shows Google AdSense ads. Google and its partners may use cookies or identifiers to serve ads based on your visits to this and other sites.",
        "You can turn off personalised advertising in Google's ad settings (adssettings.google.com) or block cookies in your browser. The site works the same either way.",
        "Google's use of that data is governed by its own policies, not by this one.",
      ],
    },
    {
      heading: "4. Technical data",
      paragraphs: [
        "Like any website, the server hosting it logs technical request data — IP address, browser type, timestamp — to operate and protect the service. We do not use it to identify people and do not cross-reference it with other sources.",
      ],
    },
    {
      heading: "5. Children",
      paragraphs: [
        "The site is not directed at children under 13 and does not knowingly collect information from them.",
      ],
    },
    {
      heading: "6. Changes and contact",
      paragraphs: [
        "If this changes, this page and the date in its header are updated.",
        `Privacy questions: ${EMAIL}.`,
      ],
    },
  ],
};

const contentEn: LegalDoc = {
  title: "Content use and intellectual property",
  lede: "Where the data comes from, how we use it, and how to have it removed.",
  sections: [
    {
      heading: "1. Where the data comes from",
      paragraphs: [
        "Product information comes from public pages of stores operating in Honduras — the same pages anyone can open in a browser, with no password and no payment.",
        "From each product we take the minimum needed to identify and compare it: name, price, previous price, availability, brand, category, one image, and the link to the original listing at the store.",
        "We do not copy whole catalogues, long descriptions, editorial copy, customer reviews, or any creative content belonging to the stores.",
      ],
    },
    {
      heading: "2. What it is used for",
      paragraphs: [
        "An informational, reference purpose: letting a person compare prices across stores before buying.",
        "Every product is shown credited to its store, with a direct link to the original listing. The comparator does not replace the store, it points to it. Traffic ends up on the store's site, not here.",
      ],
    },
    {
      heading: "3. Trademarks, names and images",
      paragraphs: [
        "Trademarks, names, logos and product images belong to their respective owners. They appear solely to identify the product or the store a price came from: a nominative, descriptive use.",
        "Their appearance on this site implies no affiliation, sponsorship, endorsement or commercial relationship with Find Your Prices, in either direction.",
      ],
    },
    {
      heading: "4. How we access the sites",
      paragraphs: ["We commit to doing it without causing nuisance or harm:"],
      list: [
        `Our automated process always identifies itself with the user agent ${BOT}. It does not disguise itself as a browser or as another service.`,
        "It leaves a deliberate pause between requests so as not to load the store's servers.",
        "If a server replies that it is overloaded or asks us to wait, it waits as instructed before retrying.",
        "It reads public content only. It creates no accounts, does not log in, and does not bypass authentication, paywalls or technical protection measures.",
        "It never accesses private or administrative areas, or any store's customer data.",
      ],
    },
    {
      heading: "5. If you are a store and do not want to appear",
      paragraphs: [
        "No legal claim is needed, no lawyer, no formal letter. Just ask and we do it.",
        `Write to ${EMAIL} stating: the store name, the website, whether you want specific products or the whole store removed, and from what address or role you are making the request.`,
        "We reply within 5 business days and carry out the removal within that same window. Removal means the store and its products stop being shown and we stop reading its site.",
        `You can also block us yourself without telling us: reject or block the user agent ${BOT} at your server or in your robots.txt. We do not try to work around blocks.`,
      ],
    },
    {
      heading: "6. If something is wrong",
      paragraphs: [
        `If a price, image or availability does not match what the store publishes, write to ${EMAIL} with the product link. We correct it or take it down.`,
        "Data refreshes several times a day, so stale data usually corrects itself within hours.",
      ],
    },
    {
      heading: "7. About this site",
      paragraphs: [
        "The design, code, catalogue organisation and Find Your Prices' own writing are ours. Everything else belongs to whoever it belongs to, as stated in point 3.",
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<Locale, Record<LegalDocId, LegalDoc>> = {
  es: { terms: termsEs, privacy: privacyEs, content: contentEs },
  en: { terms: termsEn, privacy: privacyEn, content: contentEn },
};
