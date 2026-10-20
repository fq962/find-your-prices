/**
 * Paginación de los listados "todos los productos" (`/categorias/<slug>/pagina/<n>`
 * y `/tiendas/<tienda>/pagina/<n>`).
 *
 * Existen para el rastreador. Las landings pintan 48 artículos y el resto llega
 * con "Cargar más", un botón que pide JSON: Googlebot no pulsa botones, así que
 * para él cada categoría tenía 48 productos y las demás fichas sólo existían en
 * el sitemap. Estas páginas son enlaces de verdad a cada ficha del catálogo.
 *
 * Módulo puro —sin React ni base— para poder probarlo sin montar nada.
 */

/**
 * Artículos por página. Más que el lote de la landing: cada página es un salto
 * más para el rastreador, y con 100 una tienda de 30 000 artículos son 300
 * páginas en vez de 625.
 */
export const BROWSE_PAGE_SIZE = 100;

/** Cuántas páginas hacen falta para `total` artículos. Nunca menos de una. */
export function browsePageCount(total: number): number {
  return Math.max(1, Math.ceil(Math.max(total, 0) / BROWSE_PAGE_SIZE));
}

/**
 * El número de página del segmento de la URL, o `null` si no es uno válido.
 *
 * Estricto a propósito: "02", "1.0" o "+3" no son páginas. Aceptarlos daría
 * varias URLs para la misma lista, que es justo lo que no se le quiere dar a
 * un buscador.
 */
export function parseBrowsePage(raw: string): number | null {
  if (!/^[1-9]\d{0,5}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Qué números se enlazan en la navegación. `null` marca un salto ("…").
 *
 * Con pocas páginas van todas. Con muchas: la primera, la última, las dos de
 * cada lado de la actual, y una decena de "postes" repartidos a lo largo de la
 * lista. Los postes son lo que importa en una tienda de 300 páginas: sin ellos
 * la página 150 queda a 75 saltos de la primera y el rastreador no llega
 * nunca; con ellos, a dos o tres.
 *
 * `current` 0 es "ninguna": la navegación que va al pie de una landing, que no
 * es ninguna de estas páginas.
 */
export function browsePageLinks(current: number, total: number): Array<number | null> {
  if (total <= 12) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total]);
  for (let page = current - 2; page <= current + 2; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  const step = Math.ceil(total / 10);
  for (let page = step; page < total; page += step) pages.add(page);

  const sorted = [...pages].sort((a, b) => a - b);
  const links: Array<number | null> = [];
  for (const page of sorted) {
    const previous = links[links.length - 1];
    if (typeof previous === "number" && page - previous > 1) links.push(null);
    links.push(page);
  }
  return links;
}
