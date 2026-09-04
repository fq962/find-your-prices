/**
 * Formatea un precio en la moneda indicada usando Intl.NumberFormat.
 * Ej: formatPrice(1999.9, "USD") -> "$1,999.90"
 */
export function formatPrice(
  amount: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

/** Calcula el % de descuento entre un precio original y uno actual. */
export function discountPercent(originalPrice: number, currentPrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}
