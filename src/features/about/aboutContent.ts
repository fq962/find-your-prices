import type { Locale } from "@/features/i18n/translate";

/**
 * Texto de la página "Acerca de", en los dos idiomas.
 *
 * Vive en un módulo de datos y no dentro del componente por una razón práctica:
 * son párrafos largos que cambian con frecuencia y que alguien que no toca JSX
 * tiene que poder editar. El componente sólo los pinta.
 *
 * No entra al diccionario de `translate.ts`: ese diccionario es para etiquetas
 * de interfaz —una clave, una palabra— y meterle prosa de página lo volvería
 * imposible de mantener.
 */

export interface AboutStep {
  title: string;
  body: string;
}

export interface AboutContent {
  title: string;
  lede: string;
  what: { heading: string; paragraphs: string[] };
  how: { heading: string; steps: AboutStep[] };
  creators: { heading: string; caption: string };
  honesty: { heading: string; items: string[]; policiesNote: string };
  cta: { heading: string; body: string; action: string };
}

const es: AboutContent = {
  title: "Acerca de",
  lede: "Todos los precios de Honduras en un solo lugar. Nada más.",

  what: {
    heading: "Qué es esto",
    paragraphs: [
      "Find Your Prices junta en una sola búsqueda lo que venden las tiendas de Honduras. En vez de abrir seis pestañas para averiguar dónde está más barato un televisor, lo buscás una vez y ves los precios de todas las tiendas al mismo tiempo.",
      "El catálogo se actualiza solo, varias veces al día. Cada producto conserva el enlace a la tienda donde está: acá comparás, y la compra la hacés donde siempre.",
      "Es gratis y no pide cuenta. Lo hicimos porque no existía y nos hacía falta.",
    ],
  },

  how: {
    heading: "Cómo funciona",
    steps: [
      {
        title: "Leemos las tiendas",
        body: "Un proceso automático revisa las páginas públicas de cada tienda y anota nombre, precio, disponibilidad y enlace.",
      },
      {
        title: "Ordenamos el desorden",
        body: "Cada tienda nombra y clasifica distinto. Normalizamos marcas, categorías y monedas para que dos productos comparables se puedan comparar de verdad.",
      },
      {
        title: "Vos decidís",
        body: "Buscá, filtrá, poné tiendas lado a lado o apartá hasta cuatro productos y miralos en una tabla. La decisión sigue siendo tuya.",
      },
    ],
  },

  creators: {
    heading: "Quiénes lo hicimos",
    caption:
      "Dos personas en Honduras, después del trabajo. Sin empresa detrás, sin inversionistas, sin comisión de nadie.",
  },

  honesty: {
    heading: "Lo que no somos",
    items: [
      "No vendemos nada. No hay carrito, no hay pagos, no tocamos tu tarjeta.",
      "No cobramos comisión a las tiendas ni nos pagan por aparecer más arriba. El orden lo deciden tus filtros, no la publicidad.",
      "No somos la tienda. Los precios son referenciales y pueden cambiar; el que manda es el de la tienda al momento de comprar.",
      "No tenemos afiliación con ninguna de las tiendas que aparecen acá.",
    ],
    policiesNote:
      "Si querés el detalle largo —de dónde salen los datos, qué guardamos y cómo pedir que retiremos algo—, está todo escrito:",
  },

  cta: {
    heading: "¿Buscás algo?",
    body: "El catálogo está abierto y no hay que registrarse.",
    action: "Ir al comparador",
  },
};

const en: AboutContent = {
  title: "About",
  lede: "Every price in Honduras in one place. That's it.",

  what: {
    heading: "What this is",
    paragraphs: [
      "Find Your Prices puts what Honduran stores sell into a single search. Instead of opening six tabs to find out where a TV is cheaper, you search once and see every store's price side by side.",
      "The catalogue refreshes on its own, several times a day. Every product keeps the link to the store it came from: you compare here, and you buy where you always did.",
      "It is free and asks for no account. We built it because it did not exist and we wanted it.",
    ],
  },

  how: {
    heading: "How it works",
    steps: [
      {
        title: "We read the stores",
        body: "An automated process visits each store's public pages and records name, price, availability and link.",
      },
      {
        title: "We sort out the mess",
        body: "Every store names and files things differently. We normalise brands, categories and currencies so two comparable products can actually be compared.",
      },
      {
        title: "You decide",
        body: "Search, filter, put stores side by side, or set aside up to four products and read them in one table. The call is still yours.",
      },
    ],
  },

  creators: {
    heading: "Who made it",
    caption:
      "Two people in Honduras, after hours. No company behind it, no investors, no commission from anyone.",
  },

  honesty: {
    heading: "What we are not",
    items: [
      "We sell nothing. No cart, no payments, we never touch your card.",
      "Stores pay us no commission and cannot pay to rank higher. Your filters decide the order, not advertising.",
      "We are not the store. Prices are indicative and can change; the one that counts is the store's price at checkout.",
      "We have no affiliation with any of the stores listed here.",
    ],
    policiesNote:
      "If you want the long version — where the data comes from, what we keep, and how to ask us to remove something — it is all written down:",
  },

  cta: {
    heading: "Looking for something?",
    body: "The catalogue is open and there is nothing to sign up for.",
    action: "Go to the comparator",
  },
};

export const ABOUT_CONTENT: Record<Locale, AboutContent> = { es, en };
