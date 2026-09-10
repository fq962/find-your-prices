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

export interface AboutContent {
  title: string;
  lede: string;
  what: { heading: string; paragraphs: string[] };
  /**
   * La firma de los autores, partida en dos porque los apodos van enlazados a
   * GitHub en medio de la frase. `join` es la conjunción entre los dos nombres,
   * que en español lleva espacios distintos que en inglés.
   */
  credit: { lead: string; join: string; tail: string };
  sourcing: { heading: string; paragraphs: string[] };
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

  credit: {
    lead: "Somos dos,",
    join: " y ",
    tail: ", metiéndole a esto fuera de horas. No hay empresa detrás ni inversionistas: el sitio se paga con los anuncios que ves, y hasta ahí llega.",
  },

  sourcing: {
    heading: "De dónde salen los precios",
    paragraphs: [
      "Un proceso automático pasa por las páginas públicas de Diunsa, Jetstereo, RadioShack, ACOSA y Lady Lee varias veces al día y anota lo que encuentra: nombre, precio, si hay existencia y el enlace. Nada que no puedas ver vos abriendo la página.",
      "Leerlas no es lo difícil; emparejarlas sí. Una tienda escribe «Cel. Samsung A15 128Gb» y otra «SAMSUNG Galaxy A-15 Negro 128 GB», y es el mismo teléfono. Ahí se va la mayor parte del trabajo y todavía no está resuelto del todo: si ves un precio que no cuadra, o dos productos que deberían ser uno solo, escribinos y lo corregimos.",
    ],
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

  credit: {
    lead: "There are two of us,",
    join: " and ",
    tail: ", working on this after hours. No company behind it and no investors: the site is paid for by the ads you see, and that is the whole of it.",
  },

  sourcing: {
    heading: "Where the prices come from",
    paragraphs: [
      "An automated process walks the public pages of Diunsa, Jetstereo, RadioShack, ACOSA and Lady Lee several times a day and writes down what it finds: name, price, whether it is in stock, and the link. Nothing you could not see yourself by opening the page.",
      "Reading them is not the hard part; matching them is. One store writes “Cel. Samsung A15 128Gb” and another “SAMSUNG Galaxy A-15 Black 128 GB”, and it is the same phone. That is where most of the work goes and it is not fully solved: if you spot a price that looks wrong, or two products that should be one, write to us and we will fix it.",
    ],
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
