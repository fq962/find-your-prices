/**
 * Un código de moneda que `Intl` acepta: tres letras, ni más ni menos.
 *
 * `Intl.NumberFormat` no devuelve un error, LANZA un `RangeError`, y lo hace
 * con cualquier cosa que no tenga esa forma: "L", "L.", "Lempiras", "".
 */
const ISO_CURRENCY = /^[A-Za-z]{3}$/;

/**
 * Formatea un precio en la moneda indicada usando Intl.NumberFormat.
 * Ej: formatPrice(1999.9, "USD") -> "$1,999.90"
 *
 * Nunca lanza. Y no es una precaución teórica: la moneda viene del scraping
 * —`item.prices?.currency_code || store.default_currency`—, o sea de lo que
 * publique cada tienda. Una sola fila con "L" en vez de "HNL" tumbaba la
 * lista entera, no esa fila: el precio se pinta dentro de un componente
 * cliente, y un `RangeError` ahí desmonta todo el árbol y deja el catálogo en
 * blanco. Un precio raro es un defecto de datos; una pantalla vacía es una
 * caída.
 *
 * Ante datos que Intl no admite se cae a un formato legible con el código tal
 * como llegó ("L 1,299.00"), que es peor que lo correcto y muchísimo mejor que
 * nada. El camino de los datos válidos no cambia ni un carácter.
 */
export function formatPrice(
  amount: number,
  currency = "USD",
  locale = "en-US",
): string {
  const code = typeof currency === "string" ? currency.trim() : "";
  const value = Number.isFinite(amount) ? amount : 0;

  if (ISO_CURRENCY.test(code)) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
    } catch {
      // Un locale inválido llega por la misma vía que la moneda. Cae abajo.
    }
  }

  const number = safeNumberFormat(value, locale);
  return code === "" ? number : `${code} ${number}`;
}

/**
 * El número solo, con dos decimales. `locale` también puede venir mal formado
 * —se arma a partir del idioma de la ruta—, así que este paso también protege.
 */
function safeNumberFormat(value: number, locale: string): string {
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value);
  }
}

/** Calcula el % de descuento entre un precio original y uno actual. */
export function discountPercent(originalPrice: number, currentPrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}
