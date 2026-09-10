import Link from "next/link";
import type { Locale } from "@/features/i18n/translate";
import type { Product } from "@/types";
import type { ProductDetail } from "@/server/services/catalog";
import { formatPrice } from "@/lib/format";
import { productPath } from "@/features/products/productPath";
import { ProductGallery } from "./ProductGallery";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { ProductTile } from "./ProductTile";

export interface ProductDetailViewProps {
  product: ProductDetail;
  related: Product[];
  locale: Locale;
}

const COPY = {
  es: {
    backToCatalog: "Volver al catálogo",
    viewInStore: "Ver en la tienda",
    priceHistory: "Histórico de precio",
    trackingSince: "Seguimos este precio desde el",
    notEnoughData: "Todavía no hay suficientes observaciones para dibujar una curva.",
    lowest: "Mínimo",
    highest: "Máximo",
    current: "Precio actual:",
    save: "Ahorrás",
    specs: "Ficha técnica",
    identifiers: "Identificadores",
    related: "Artículos parecidos",
    lastChecked: "Último chequeo",
    unchangedFor: "Sin cambio de precio hace",
    days: "días",
    today: "hoy",
    stock: "Existencias",
    units: "unidades",
    tax: "Impuesto",
    taxIncluded: "incluido en el precio",
    unit: "Unidad de venta",
    barcode: "Código de barras",
    sku: "SKU",
    brand: "Marca",
    category: "Categoría",
    condition: "Estado",
    conditionNew: "Nuevo",
    rating: "Valoración",
    votes: "votos",
    priceDisclaimer:
      "El precio lo publica la tienda y puede cambiar sin aviso. Verificá siempre en el sitio de origen antes de comprar.",
  },
  en: {
    backToCatalog: "Back to catalog",
    viewInStore: "View in store",
    priceHistory: "Price history",
    trackingSince: "Tracking this price since",
    notEnoughData: "Not enough observations yet to draw a curve.",
    lowest: "Lowest",
    highest: "Highest",
    current: "Current price:",
    save: "You save",
    specs: "Specifications",
    identifiers: "Identifiers",
    related: "Similar items",
    lastChecked: "Last checked",
    unchangedFor: "Price unchanged for",
    days: "days",
    today: "today",
    stock: "Stock",
    units: "units",
    tax: "Tax",
    taxIncluded: "included in price",
    unit: "Sold by",
    barcode: "Barcode",
    sku: "SKU",
    brand: "Brand",
    category: "Category",
    condition: "Condition",
    conditionNew: "New",
    rating: "Rating",
    votes: "votes",
    priceDisclaimer:
      "The price is published by the store and may change without notice. Always verify on the source site before buying.",
  },
} as const;

const PRICE_LOCALES: Record<Locale, string> = { es: "es-HN", en: "en-HN" };

/**
 * Ficha de producto.
 *
 * ---------------------------------------------------------------------------
 * Qué contesta esta página
 * ---------------------------------------------------------------------------
 * "¿Es buen precio?". Todo lo demás está subordinado a eso. Por eso el precio
 * va en escala grande junto al ahorro, y el histórico ocupa un bloque propio
 * en vez de esconderse al final: es el único dato que una tienda no da y que
 * responde de verdad la pregunta.
 *
 * Composición asimétrica en dos columnas: la galería a la izquierda es alta y
 * cuadrada, la columna de decisión a la derecha es angosta y densa. Alternar
 * masa visual con densidad de datos evita la simetría plana de las fichas de
 * e-commerce genéricas.
 *
 * Es un Server Component: no necesita estado. Solo la galería y su zoom son
 * cliente.
 */
export function ProductDetailView({ product, related, locale }: ProductDetailViewProps) {
  const copy = COPY[locale];
  const priceLocale = PRICE_LOCALES[locale];

  const hasDiscount = product.listPrice !== undefined && product.listPrice > product.price;
  const savings = hasDiscount ? product.listPrice! - product.price : 0;

  const identifiers: Array<[string, string | undefined]> = [
    [copy.sku, product.sku],
    [copy.barcode, product.barcode],
    ["GTIN-14", product.gtin],
    [copy.brand, product.brand],
    [copy.category, product.category],
    [
      copy.condition,
      product.condition === "new" ? copy.conditionNew : product.condition,
    ],
    [copy.unit, product.unitMeasureName],
    [
      copy.tax,
      product.taxRate !== undefined
        ? `${product.taxRate}%${product.taxIncluded ? ` · ${copy.taxIncluded}` : ""}`
        : undefined,
    ],
    [
      copy.stock,
      product.stockQuantity !== undefined
        ? `${product.stockQuantity} ${copy.units}`
        : undefined,
    ],
    [
      copy.rating,
      product.ratingAverage !== undefined
        ? `${product.ratingAverage.toFixed(1)} / 5 · ${product.ratingCount ?? 0} ${copy.votes}`
        : undefined,
    ],
  ];

  const presentIdentifiers = identifiers.filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
  );

  const specEntries = Object.entries(product.specs ?? {}).filter(
    ([, value]) => value !== null && value !== "" && typeof value !== "object",
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <nav className="py-6">
        <Link
          href={locale === "en" ? "/en" : "/"}
          className="group inline-flex items-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:-translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {copy.backToCatalog}
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
        {/* Columna izquierda: la imagen manda -------------------------------- */}
        <div className="enter" style={{ ["--enter-delay" as string]: "80ms" }}>
          <ProductGallery
            images={product.images}
            productName={product.name}
            discountPercent={hasDiscount ? product.discountPercent : undefined}
          />
        </div>

        {/* Columna derecha: la decisión de compra ---------------------------- */}
        <div className="enter flex flex-col gap-7" style={{ ["--enter-delay" as string]: "200ms" }}>
          <header>
            {product.brand && (
              <p className="text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
                {product.brand}
              </p>
            )}
            <h1 className="mt-2 text-[clamp(1.5rem,4vw,2.125rem)] leading-[1.12] font-semibold tracking-[-0.03em] text-balance text-[var(--text)]">
              {product.name}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-[var(--text-tertiary)]">
              <span className="uppercase">{product.store}</span>
              {product.availability && (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current" />
                  <span className={product.inStock ? "text-emerald-600 dark:text-emerald-400" : ""}>
                    {product.availability}
                  </span>
                </>
              )}
            </p>
          </header>

          {/* El precio es lo único en escala grande de esta columna. */}
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[clamp(2rem,6vw,2.75rem)] leading-none font-semibold tracking-[-0.035em] tabular-nums text-[var(--text)]">
                {formatPrice(product.price, product.currency, priceLocale)}
              </span>
              {hasDiscount && (
                <span className="text-[1.125rem] tabular-nums text-[var(--text-tertiary)] line-through">
                  {formatPrice(product.listPrice!, product.currency, priceLocale)}
                </span>
              )}
            </div>

            {hasDiscount && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--price-win-soft)] px-3 py-1 text-[0.8125rem] font-medium text-[var(--price-win)] tabular-nums">
                {copy.save} {formatPrice(savings, product.currency, priceLocale)}
                {product.discountPercent !== undefined &&
                  ` · ${Math.round(product.discountPercent)}%`}
              </p>
            )}

            <p className="mt-3 text-[0.8125rem] text-[var(--text-tertiary)] tabular-nums">
              {copy.lastChecked}:{" "}
              {new Date(product.lastSeenAt).toLocaleString(priceLocale, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Tegucigalpa",
              })}
              {product.daysAtCurrentPrice !== undefined && (
                <>
                  {" · "}
                  {copy.unchangedFor}{" "}
                  {product.daysAtCurrentPrice === 0
                    ? copy.today
                    : `${product.daysAtCurrentPrice} ${copy.days}`}
                </>
              )}
            </p>
          </div>

          {product.url && (
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--text)] px-6 py-3.5 text-[0.9375rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.015] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              {copy.viewInStore}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>
          )}

          {product.description && product.description !== product.name && (
            <p className="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
              {product.description}
            </p>
          )}

          {/* La advertencia va junto al precio, no escondida al pie: quien
              decide comprar tiene que leerla en el mismo golpe de vista. */}
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
            {copy.priceDisclaimer}
          </p>
        </div>
      </div>

      {/* Histórico ---------------------------------------------------------- */}
      <section className="enter mt-16" style={{ ["--enter-delay" as string]: "320ms" }}>
        <PriceHistoryChart
          history={product.priceHistory}
          currency={product.currency}
          locale={priceLocale}
          labels={{
            title: copy.priceHistory,
            trackingSince: copy.trackingSince,
            notEnoughData: copy.notEnoughData,
            lowest: copy.lowest,
            highest: copy.highest,
            current: copy.current,
          }}
        />
      </section>

      {/* Datos -------------------------------------------------------------- */}
      <section className="mt-16 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
            {copy.identifiers}
          </h2>
          <dl className="mt-4">
            {presentIdentifiers.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-3 last:border-0"
              >
                <dt className="shrink-0 text-[0.8125rem] text-[var(--text-tertiary)]">{label}</dt>
                <dd className="text-right text-[0.875rem] tabular-nums text-[var(--text)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {specEntries.length > 0 && (
          <div>
            <h2 className="text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
              {copy.specs}
            </h2>
            <dl className="mt-4">
              {specEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-3 last:border-0"
                >
                  <dt className="shrink-0 text-[0.8125rem] text-[var(--text-tertiary)]">{key}</dt>
                  <dd className="text-right text-[0.875rem] text-[var(--text)]">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {/* Relacionados ------------------------------------------------------- */}
      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-5 text-[1.375rem] font-semibold tracking-[-0.025em] text-[var(--text)]">
            {copy.related}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id}>
                <ProductTile
                  product={item}
                  href={item.slug ? productPath(locale, item.slug) : (item.url ?? "#")}
                  mode="grid"
                  density="cosy"
                  locale={priceLocale}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
