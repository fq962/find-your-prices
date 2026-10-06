"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { SHELL } from "@/components/layout/shell";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { productPath } from "@/features/products/productPath";
import { formatPrice } from "@/lib/format";
import { useCart } from "../useCart";
import { useQuoteOffers } from "../useQuoteOffers";
import {
  buildQuote,
  offerToProduct,
  quoteNumber,
  type MoneyByCurrency,
  type Quote,
  type QuoteItem,
  type QuoteStoreGroup,
} from "../quote";
import { decodeCart, encodeCart, SHARE_PARAM } from "../share";
import type { CartLine } from "../types";
import { QuantityStepper } from "./QuantityStepper";

/**
 * La cotización: el carrito convertido en un recorrido de compras.
 *
 * ---------------------------------------------------------------------------
 * Qué contesta esta página
 * ---------------------------------------------------------------------------
 * "¿A dónde voy y qué compro en cada lugar?". No es una comparación de
 * precios —eso ya lo hizo la persona al buscar—, es la hoja que se lleva a la
 * calle. Por eso se organiza en PARADAS (una por tienda, la de más artículos
 * primero) y dentro de cada parada por la categoría con que la tienda nombra
 * su pasillo o su menú, que es como se encuentra el producto allá.
 *
 * El recorrido se lee de un vistazo arriba (la línea de paradas con su
 * subtotal) y se recorre abajo. Se exporta de dos formas: PDF —la impresión
 * del navegador, con una hoja de estilos que deja solo el documento— y un
 * enlace que lleva la lista entera en la URL.
 *
 * Dos modos con la misma vista:
 * - propio: el carrito de este navegador, editable;
 * - compartido (`?c=`): la lista de otra persona, solo lectura, con la opción
 *   de copiarla al carrito propio.
 */

export interface QuoteViewProps {
  locale: Locale;
  /** Valor de `?c=` si se abrió un enlace compartido. */
  shared?: string;
}

const COPY = {
  es: {
    eyebrow: "Cotización",
    title: "Tu recorrido de compras",
    sharedTitle: "Recorrido compartido",
    ledeStores: (stores: number, lines: number) =>
      stores === 1
        ? `Todo en una tienda: ${lines} ${lines === 1 ? "artículo" : "artículos"}.`
        : `${stores} paradas, ${lines} artículos. Este es el orden.`,
    stop: "Parada",
    items: (n: number) => `${n} ${n === 1 ? "artículo" : "artículos"}`,
    units: (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`,
    subtotal: "Subtotal",
    total: "Total estimado",
    noCategory: "Sin categoría en la tienda",
    storeCategory: "Categoría en la tienda",
    priceAt: "Precio al",
    unchangedSince: "sin cambios desde el",
    savedPrice: "precio guardado el",
    each: "c/u",
    priceUp: "subió",
    priceDown: "bajó",
    sinceAdded: "desde que lo agregaste",
    unavailable: "Ya no está disponible en esta tienda",
    alsoAt: "También en",
    availableAt: "Disponible en",
    save: "ahorrás",
    switchTo: "Cambiar",
    applyAll: "Cambiar todo a la opción más barata",
    potentialSavings: "Podés ahorrar",
    potentialSavingsTail: (n: number) => `cambiando ${n} ${n === 1 ? "artículo" : "artículos"} de tienda.`,
    viewInStore: "Ver en la tienda",
    remove: "Quitar",
    decrease: "Quitar una unidad",
    increase: "Agregar una unidad",
    quantity: "Cantidad",
    pdf: "Descargar PDF",
    copyLink: "Copiar enlace",
    linkCopied: "Enlace copiado",
    share: "Compartir",
    clear: "Vaciar",
    clearConfirm: "¿Vaciar la cotización?",
    checking: "Verificando precios vigentes…",
    checkedAt: "Precios verificados el",
    checkFailed: "No pudimos verificar los precios: se muestran los guardados.",
    retry: "Reintentar",
    emptyTitle: "Tu cotización está vacía",
    emptyBody:
      "Buscá lo que necesitás con el buscador de arriba y tocá el carrito de cada producto. Acá se arma el recorrido: qué comprar en cada tienda y en qué categoría encontrarlo.",
    browse: "Ir al buscador",
    sharedNote: "Esta lista te la compartieron. Los precios son los vigentes hoy.",
    sharedMissing: (n: number) =>
      `${n} ${n === 1 ? "artículo de la lista ya no está" : "artículos de la lista ya no están"} disponibles en el catálogo.`,
    saveShared: "Guardar en mi carrito",
    savedShared: "Guardado en tu carrito",
    sharedEmpty: "Este enlace no trae ningún artículo que podamos leer.",
    sharedLoading: "Cargando la lista…",
    printLink: "Abrí esta lista en línea:",
    disclaimer:
      "Los precios los publica cada tienda y pueden cambiar sin aviso. La fecha indica la última vez que vimos ese precio. Verificá en la tienda antes de comprar.",
    issuedOn: "Emitida el",
  },
  en: {
    eyebrow: "Quote",
    title: "Your shopping route",
    sharedTitle: "Shared shopping route",
    ledeStores: (stores: number, lines: number) =>
      stores === 1
        ? `All in one store: ${lines} ${lines === 1 ? "item" : "items"}.`
        : `${stores} stops, ${lines} items. Here's the order.`,
    stop: "Stop",
    items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    units: (n: number) => `${n} ${n === 1 ? "unit" : "units"}`,
    subtotal: "Subtotal",
    total: "Estimated total",
    noCategory: "No store category",
    storeCategory: "Store category",
    priceAt: "Price as of",
    unchangedSince: "unchanged since",
    savedPrice: "price saved on",
    each: "ea.",
    priceUp: "up",
    priceDown: "down",
    sinceAdded: "since you added it",
    unavailable: "No longer available at this store",
    alsoAt: "Also at",
    availableAt: "Available at",
    save: "you save",
    switchTo: "Switch",
    applyAll: "Switch everything to the cheapest option",
    potentialSavings: "You could save",
    potentialSavingsTail: (n: number) => `by moving ${n} ${n === 1 ? "item" : "items"} to another store.`,
    viewInStore: "View in store",
    remove: "Remove",
    decrease: "Remove one",
    increase: "Add one",
    quantity: "Quantity",
    pdf: "Download PDF",
    copyLink: "Copy link",
    linkCopied: "Link copied",
    share: "Share",
    clear: "Clear",
    clearConfirm: "Clear the quote?",
    checking: "Checking current prices…",
    checkedAt: "Prices checked on",
    checkFailed: "We couldn't check prices: showing saved ones.",
    retry: "Retry",
    emptyTitle: "Your quote is empty",
    emptyBody:
      "Search for what you need with the search bar above and tap the cart on each product. This page builds the route: what to buy at each store and which category to find it in.",
    browse: "Go to search",
    sharedNote: "Someone shared this list with you. Prices are today's.",
    sharedMissing: (n: number) =>
      `${n} ${n === 1 ? "item from the list is" : "items from the list are"} no longer in the catalog.`,
    saveShared: "Save to my cart",
    savedShared: "Saved to your cart",
    sharedEmpty: "This link doesn't carry any item we can read.",
    sharedLoading: "Loading the list…",
    printLink: "Open this list online:",
    disclaimer:
      "Prices are published by each store and may change without notice. The date is the last time we saw that price. Check at the store before buying.",
    issuedOn: "Issued on",
  },
} as const;

type Copy = (typeof COPY)[Locale];

const PRICE_LOCALES: Record<Locale, string> = { es: "es-HN", en: "en-HN" };
const TIME_ZONE = "America/Tegucigalpa";

const noop = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatMoney(money: MoneyByCurrency, locale: string): string {
  const entries = Object.entries(money);
  if (entries.length === 0) return formatPrice(0, "HNL", locale);
  return entries.map(([currency, amount]) => formatPrice(amount, currency, locale)).join(" + ");
}

function pad(index: number): string {
  return String(index + 1).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

export function QuoteView({ locale, shared }: QuoteViewProps) {
  const copy = COPY[locale];
  const priceLocale = PRICE_LOCALES[locale];
  const hydrated = useHydrated();
  const cart = useCart();

  const sharedLines = useMemo(() => (shared ? decodeCart(shared) : null), [shared]);
  const isShared = sharedLines !== null;

  const ids = useMemo(
    () => (sharedLines ? sharedLines.map((line) => line.id) : cart.lines.map((line) => line.product.id)),
    [sharedLines, cart.lines],
  );
  const offers = useQuoteOffers(ids, hydrated);

  // En modo compartido no hay fotos guardadas: los renglones se arman con lo
  // que respondió el servidor. Lo que no volvió ya no existe en el catálogo.
  const lines: CartLine[] = useMemo(() => {
    if (!sharedLines) return cart.lines;
    if (!offers.results) return [];
    return sharedLines.flatMap((line) => {
      const offer = offers.results?.get(line.id)?.offer;
      return offer
        ? [{ product: offerToProduct(offer), quantity: line.quantity, addedAt: offer.priceSeenAt }]
        : [];
    });
  }, [sharedLines, cart.lines, offers.results]);

  const quote = useMemo(() => buildQuote(lines, offers.results), [lines, offers.results]);
  const missingShared =
    sharedLines && offers.results ? sharedLines.length - lines.length : 0;

  if (!hydrated || (isShared && offers.status === "loading" && !offers.results)) {
    return (
      <div className={`${SHELL} pb-20`}>
        <QuoteHeaderSkeleton copy={copy} shared={isShared} />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className={`${SHELL} pb-20`}>
        <EmptyQuote copy={copy} locale={locale} shared={isShared} sharedFailed={offers.status === "error"} />
      </div>
    );
  }

  return (
    <QuoteDocument
      copy={copy}
      locale={locale}
      priceLocale={priceLocale}
      quote={quote}
      lines={lines}
      editable={!isShared}
      shared={isShared}
      missingShared={missingShared}
      status={offers.status}
      checkedAt={offers.checkedAt}
      onRetry={offers.retry}
    />
  );
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

interface QuoteDocumentProps {
  copy: Copy;
  locale: Locale;
  priceLocale: string;
  quote: Quote;
  lines: CartLine[];
  editable: boolean;
  shared: boolean;
  missingShared: number;
  status: "loading" | "ready" | "error";
  checkedAt: string | null;
  onRetry: () => void;
}

function QuoteDocument({
  copy,
  locale,
  priceLocale,
  quote,
  lines,
  editable,
  shared,
  missingShared,
  status,
  checkedAt,
  onRetry,
}: QuoteDocumentProps) {
  const cart = useCart();
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [savedShared, setSavedShared] = useState(false);

  // La fecha de emisión es la de ahora: se calcula una vez por montaje para
  // que el número no cambie a medianoche con la página abierta.
  const [issuedAt] = useState(() => new Date());
  const number = quoteNumber(lines, issuedAt);

  const shareUrl = useMemo(() => {
    const encoded = encodeCart(lines.map((line) => ({ id: line.product.id, quantity: line.quantity })));
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${routeFor("quote", locale)}?${SHARE_PARAM}=${encoded}`;
  }, [lines, locale]);

  const swapCount = quote.swaps.filter((swap) => {
    const item = quote.groups.flatMap((group) => group.items).find((i) => i.line.product.id === swap.fromId);
    return item && item.savings > 0;
  }).length;
  const hasSavings = Object.keys(quote.savings).length > 0;

  async function handleCopyLink() {
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${copy.eyebrow} ${number}`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      // Compartir cancelado o portapapeles bloqueado: no hay nada que avisar.
    }
  }

  function handleClear() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    cart.clear();
    setConfirmingClear(false);
  }

  function handleSaveShared() {
    for (const line of lines) cart.add(line.product, line.quantity);
    setSavedShared(true);
  }

  function applyAllSavings() {
    cart.replaceMany(
      quote.groups
        .flatMap((group) => group.items)
        .filter((item) => item.better && item.savings > 0)
        .map((item) => ({ fromId: item.line.product.id, product: offerToProduct(item.better!) })),
    );
  }

  return (
    <article className={`${SHELL} pb-20 print:max-w-none print:px-0 print:pb-0`}>
      {/* Encabezado ------------------------------------------------------- */}
      <header className="pt-12 pb-8 sm:pt-16 sm:pb-10 print:pt-0 print:pb-6">
        <p
          className="enter flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase tabular-nums"
          style={{ "--enter-delay": "40ms" } as CSSProperties}
        >
          <span>
            {copy.eyebrow} {number}
          </span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current" />
          <span>
            {copy.issuedOn} {formatDate(issuedAt.toISOString(), PRICE_LOCALES[locale])}
          </span>
        </p>
        <h1
          className="enter mt-4 max-w-[14ch] text-[clamp(2.5rem,8.5vw,5.25rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-balance text-[var(--text)] print:text-[2.5rem]"
          style={{ "--enter-delay": "100ms" } as CSSProperties}
        >
          {shared ? copy.sharedTitle : copy.title}
        </h1>
        <p
          className="enter mt-4 max-w-[34ch] font-serif text-[clamp(1.25rem,4vw,1.75rem)] leading-[1.15] tracking-[-0.01em] text-[var(--text-secondary)] italic"
          style={{ "--enter-delay": "180ms" } as CSSProperties}
        >
          {copy.ledeStores(quote.storeCount, quote.lineCount)}
        </p>

        {/* Acciones. Nada de esto sale en el PDF. */}
        <div
          className="enter mt-8 flex flex-wrap items-center gap-2 print:hidden"
          style={{ "--enter-delay": "260ms" } as CSSProperties}
        >
          <button type="button" onClick={() => window.print()} className={PRIMARY_BUTTON}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
            </svg>
            {copy.pdf}
          </button>
          <button type="button" onClick={handleCopyLink} className={SECONDARY_BUTTON} aria-live="polite">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {linkCopied ? (
                <path d="m5.5 12.5 4 4 9-9" />
              ) : (
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
              )}
            </svg>
            {linkCopied ? copy.linkCopied : copy.copyLink}
          </button>
          {shared ? (
            <button type="button" onClick={handleSaveShared} disabled={savedShared} className={SECONDARY_BUTTON}>
              {savedShared ? copy.savedShared : copy.saveShared}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClear}
              onBlur={() => setConfirmingClear(false)}
              className={`${GHOST_BUTTON} ${
                confirmingClear
                  ? "border-[var(--critical)] bg-[var(--critical-soft)] text-[var(--critical)]"
                  : ""
              }`}
            >
              {confirmingClear ? copy.clearConfirm : copy.clear}
            </button>
          )}
        </div>

        <StatusLine
          copy={copy}
          priceLocale={priceLocale}
          status={status}
          checkedAt={checkedAt}
          onRetry={onRetry}
        />
        {shared && (
          <p className="mt-2 text-[0.8125rem] text-[var(--text-tertiary)] print:hidden">
            {copy.sharedNote}
            {missingShared > 0 && ` ${copy.sharedMissing(missingShared)}`}
          </p>
        )}
      </header>

      {/* La ruta: el recorrido entero de un vistazo -------------------------- */}
      <RouteOverview copy={copy} priceLocale={priceLocale} quote={quote} />

      {editable && hasSavings && (
        <aside
          className="enter mt-4 flex flex-col items-start gap-2 rounded-2xl border border-[var(--border)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
          style={{ "--enter-delay": "380ms" } as CSSProperties}
        >
          <p className="text-[0.8125rem] text-[var(--text-secondary)]">
            {copy.potentialSavings}{" "}
            <strong className="font-semibold tabular-nums text-[var(--price-win)]">
              {formatMoney(quote.savings, priceLocale)}
            </strong>{" "}
            {copy.potentialSavingsTail(swapCount)}
          </p>
          <button
            type="button"
            onClick={applyAllSavings}
            className="shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--price-win)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--price-win-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {copy.applyAll}
          </button>
        </aside>
      )}

      {/* Paradas ---------------------------------------------------------- */}
      <ol className="mt-12 flex flex-col gap-14 sm:mt-16 sm:gap-20 print:mt-8 print:gap-8">
        {quote.groups.map((group, index) => (
          <StoreStop
            key={group.storeSlug}
            copy={copy}
            locale={locale}
            priceLocale={priceLocale}
            group={group}
            index={index}
            editable={editable}
          />
        ))}
      </ol>

      {/* Total ------------------------------------------------------------ */}
      <footer className="mt-16 border-t-2 border-[var(--text)] pt-6 sm:mt-20 print:mt-10 print:break-inside-avoid">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
              {copy.total}
            </p>
            <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)] tabular-nums">
              {copy.items(quote.lineCount - quote.unavailableCount)} · {copy.units(quote.units)} ·{" "}
              {quote.storeCount} {locale === "es" ? (quote.storeCount === 1 ? "tienda" : "tiendas") : quote.storeCount === 1 ? "store" : "stores"}
            </p>
          </div>
          <p className="text-[clamp(2.25rem,7vw,4rem)] leading-none font-semibold tracking-[-0.045em] tabular-nums text-[var(--text)]">
            {formatMoney(quote.total, priceLocale)}
          </p>
        </div>
        <p className="mt-6 max-w-[70ch] text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          {copy.disclaimer}
        </p>
        {/* Solo en el PDF: el papel no tiene botón de "copiar enlace". */}
        <p className="mt-3 hidden text-[0.75rem] break-all text-[var(--text-tertiary)] print:block">
          {copy.printLink} {shareUrl}
        </p>
      </footer>
    </article>
  );
}

const PRIMARY_BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-full bg-[var(--text)] px-5 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const SECONDARY_BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-5 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-[border-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:border-[var(--text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-60";
const GHOST_BUTTON =
  "inline-flex h-11 items-center rounded-full border border-transparent px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] outline-none transition-[background-color,border-color,color] duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function StatusLine({
  copy,
  priceLocale,
  status,
  checkedAt,
  onRetry,
}: {
  copy: Copy;
  priceLocale: string;
  status: "loading" | "ready" | "error";
  checkedAt: string | null;
  onRetry: () => void;
}) {
  return (
    <p className="mt-5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-[var(--text-tertiary)] tabular-nums" aria-live="polite">
      {status === "loading" && (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] [animation:fyp-pulse_1.2s_var(--ease-in-out-expo)_infinite]" />
          {copy.checking}
        </>
      )}
      {status === "ready" && checkedAt && (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--price-win)]" />
          {copy.checkedAt} {formatDateTime(checkedAt, priceLocale)}
        </>
      )}
      {status === "error" && (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--critical)]" />
          <span className="text-[var(--critical)]">{copy.checkFailed}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full px-2 py-0.5 font-medium text-[var(--accent)] outline-none hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] print:hidden"
          >
            {copy.retry}
          </button>
        </>
      )}
    </p>
  );
}

/**
 * La línea de paradas: cada tienda con su número, cuántas cosas y cuánto.
 * Es el recorrido entero en una mirada antes de bajar al detalle, y el
 * lugar donde mañana va a vivir la ruta por cercanía.
 */
function RouteOverview({ copy, priceLocale, quote }: { copy: Copy; priceLocale: string; quote: Quote }) {
  return (
    <nav aria-label={copy.stop} className="enter" style={{ "--enter-delay": "320ms" } as CSSProperties}>
      {/* Las líneas entre celdas son el `gap` sobre el fondo del borde; el
          relleno de cada celda tapa el resto. Las columnas se ajustan a
          cuántas paradas hay para que no queden celdas vacías en la fila. */}
      <ol
        className={`relative grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] ${
          quote.groups.length === 1
            ? ""
            : quote.groups.length === 2 || quote.groups.length === 4
              ? "sm:grid-cols-2 print:grid-cols-2"
              : "sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3"
        }`}
      >
        {quote.groups.map((group, index) => (
          <li
            key={group.storeSlug}
            // Con 5, 7… paradas la última fila queda corta: la última celda
            // se estira hasta el final en vez de dejar un hueco gris.
            className="bg-[var(--bg-elevated)] last:col-[auto/-1]"
          >
            <a
              href={`#parada-${group.storeSlug}`}
              className="group flex h-full items-start gap-4 px-5 py-4 outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:bg-[var(--bg-subtle)]"
            >
              <span className="font-serif text-[2rem] leading-none text-[var(--text-tertiary)] italic tabular-nums transition-colors duration-[var(--dur-fast)] group-hover:text-[var(--text)]">
                {pad(index)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--text)]">
                  {group.store}
                </span>
                <span className="text-[0.75rem] text-[var(--text-tertiary)]">
                  {copy.items(group.items.length)} · {copy.units(group.units)}
                </span>
              </span>
              <span className="shrink-0 pt-0.5 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">
                {formatMoney(group.subtotal, priceLocale)}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StoreStop({
  copy,
  locale,
  priceLocale,
  group,
  index,
  editable,
}: {
  copy: Copy;
  locale: Locale;
  priceLocale: string;
  group: QuoteStoreGroup;
  index: number;
  editable: boolean;
}) {
  return (
    <li
      id={`parada-${group.storeSlug}`}
      className="enter scroll-mt-24 print:break-inside-avoid-page"
      style={{ "--enter-delay": `${420 + Math.min(index, 4) * 90}ms` } as CSSProperties}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-[var(--text)] pb-4">
        <div className="flex items-end gap-4 sm:gap-6">
          <span className="font-serif text-[clamp(3.5rem,11vw,6.5rem)] leading-[0.78] text-[var(--text)] italic tabular-nums print:text-[3rem]">
            {pad(index)}
          </span>
          <div className="pb-1">
            <p className="text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
              {copy.stop} {pad(index)}
            </p>
            <h2 className="mt-1 text-[clamp(1.5rem,4.5vw,2.25rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-[var(--text)]">
              {group.store}
            </h2>
            <p className="mt-1 text-[0.8125rem] text-[var(--text-tertiary)]">
              {copy.items(group.items.length)} · {copy.units(group.units)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
            {copy.subtotal}
          </p>
          <p className="mt-1 text-[1.5rem] leading-none font-semibold tracking-[-0.03em] tabular-nums text-[var(--text)]">
            {formatMoney(group.subtotal, priceLocale)}
          </p>
        </div>
      </header>

      <div className="flex flex-col">
        {group.sections.map((section) => (
          <section key={section.category ?? "—"} className="pt-6 print:break-inside-avoid">
            <h3 className="flex items-center gap-3 text-[0.75rem] font-medium tracking-[0.08em] text-[var(--text-secondary)] uppercase">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6l8 8-9.1 9.1-8-8Z" />
                <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
              </svg>
              <span className="sr-only">{copy.storeCategory}: </span>
              {section.category ?? copy.noCategory}
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--border)]" />
            </h3>
            <ul className="mt-1 divide-y divide-[var(--border)]">
              {section.items.map((item) => (
                <QuoteRow
                  key={item.line.product.id}
                  copy={copy}
                  locale={locale}
                  priceLocale={priceLocale}
                  item={item}
                  editable={editable}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </li>
  );
}

function QuoteRow({
  copy,
  locale,
  priceLocale,
  item,
  editable,
}: {
  copy: Copy;
  locale: Locale;
  priceLocale: string;
  item: QuoteItem;
  editable: boolean;
}) {
  const cart = useCart();
  const { offer, line } = item;
  const href = offer.slug ? productPath(locale, offer.slug) : undefined;
  const dateLabel = item.fresh
    ? `${copy.priceAt} ${formatDate(offer.priceSeenAt, priceLocale)}`
    : `${copy.savedPrice} ${formatDate(line.addedAt, priceLocale)}`;

  return (
    <li className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[4rem_minmax(0,1fr)_auto] print:grid-cols-[2.75rem_minmax(0,1fr)_auto] print:py-3 ${item.unavailable ? "opacity-70" : ""}`}>
      {/* Foto: placa blanca como en las tarjetas del catálogo. */}
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-white">
        {offer.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={offer.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain p-1.5" />
        ) : null}
      </div>

      <div className="min-w-0">
        {href ? (
          <Link
            href={href}
            className="line-clamp-2 rounded text-[0.9375rem] leading-[1.35] font-medium tracking-[-0.01em] text-[var(--text)] outline-none hover:underline hover:decoration-[var(--border-strong)] hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {offer.name}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[0.9375rem] leading-[1.35] font-medium tracking-[-0.01em] text-[var(--text)]">
            {offer.name}
          </p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.75rem] text-[var(--text-tertiary)] tabular-nums">
          {offer.brand && (
            <>
              <span>{offer.brand}</span>
              <span aria-hidden="true" className="h-0.5 w-0.5 rounded-full bg-current" />
            </>
          )}
          <span>{dateLabel}</span>
          {item.fresh &&
            offer.priceSince &&
            formatDate(offer.priceSince, priceLocale) !== formatDate(offer.priceSeenAt, priceLocale) && (
            <span className="hidden sm:inline">
              ({copy.unchangedSince} {formatDate(offer.priceSince, priceLocale)})
            </span>
          )}
        </p>

        {item.priceDelta !== 0 && !item.unavailable && (
          <p
            className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums ${
              item.priceDelta > 0
                ? "bg-[var(--critical-soft)] text-[var(--critical)]"
                : "bg-[var(--price-win-soft)] text-[var(--price-win)]"
            }`}
          >
            {item.priceDelta > 0 ? "↑" : "↓"} {item.priceDelta > 0 ? copy.priceUp : copy.priceDown}{" "}
            {formatPrice(Math.abs(item.priceDelta), offer.currency, priceLocale)} {copy.sinceAdded}
          </p>
        )}

        {item.unavailable && (
          <p className="mt-1.5 text-[0.8125rem] font-medium text-[var(--critical)]">{copy.unavailable}</p>
        )}

        {/* Controles: solo en la lista propia y nunca en el PDF. */}
        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
            <QuantityStepper
              size="sm"
              value={line.quantity}
              onChange={(value) => cart.setQuantity(line.product.id, value)}
              labels={copy}
              itemName={offer.name}
            />
            <button
              type="button"
              onClick={() => cart.remove(line.product.id)}
              aria-label={`${copy.remove}: ${offer.name}`}
              className="rounded-full px-2 py-1 text-[0.75rem] font-medium text-[var(--text-tertiary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--critical)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {copy.remove}
            </button>
            {offer.url && (
              <a
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-full px-2 py-1 text-[0.75rem] font-medium text-[var(--accent)] outline-none hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {copy.viewInStore} ↗
              </a>
            )}
          </div>
        )}

        {/* La otra tienda: un dato al margen, no el centro de la página. */}
        {editable && item.better && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.75rem] text-[var(--text-secondary)] tabular-nums print:hidden">
            <span>
              {item.unavailable ? copy.availableAt : copy.alsoAt}{" "}
              <strong className="font-semibold text-[var(--text)]">{item.better.store}</strong>{" "}
              {formatPrice(item.better.price, item.better.currency, priceLocale)}
              {item.savings > 0 && (
                <span className="text-[var(--price-win)]">
                  {" "}
                  · {copy.save} {formatPrice(item.savings, item.better.currency, priceLocale)}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => cart.replace(line.product.id, offerToProduct(item.better!))}
              className="rounded-full px-2 py-0.5 font-medium text-[var(--accent)] outline-none hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {copy.switchTo}
            </button>
          </p>
        )}
      </div>

      {/* Cifras: alineadas a la derecha para sumarse con la vista. */}
      <div className="col-start-2 flex items-baseline justify-between gap-4 sm:col-start-3 sm:flex-col sm:items-end sm:justify-start">
        <p className="text-[0.8125rem] text-[var(--text-tertiary)] tabular-nums">
          {line.quantity} × {formatPrice(offer.price, offer.currency, priceLocale)}{" "}
          <span className="sr-only sm:not-sr-only">{copy.each}</span>
        </p>
        <p
          className={`text-[1.0625rem] font-semibold tracking-[-0.02em] tabular-nums ${
            item.unavailable ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text)]"
          }`}
        >
          {formatPrice(item.subtotal, offer.currency, priceLocale)}
        </p>
      </div>
    </li>
  );
}

function QuoteHeaderSkeleton({ copy, shared }: { copy: Copy; shared: boolean }) {
  return (
    <div className="pt-12 sm:pt-16" aria-busy="true">
      <p className="text-[0.6875rem] font-medium tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
        {copy.eyebrow}
      </p>
      <h1 className="mt-4 max-w-[14ch] text-[clamp(2.5rem,8.5vw,5.25rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-[var(--text)]">
        {shared ? copy.sharedTitle : copy.title}
      </h1>
      {shared && <p className="mt-4 text-[0.875rem] text-[var(--text-tertiary)]">{copy.sharedLoading}</p>}
      <div aria-hidden="true" className="mt-10 h-24 rounded-2xl bg-[var(--bg-subtle)]" />
      <div aria-hidden="true" className="mt-12 h-64 rounded-2xl bg-[var(--bg-subtle)]" />
    </div>
  );
}

function EmptyQuote({
  copy,
  locale,
  shared,
  sharedFailed,
}: {
  copy: Copy;
  locale: Locale;
  shared: boolean;
  sharedFailed: boolean;
}) {
  return (
    <div className="pt-12 sm:pt-16">
      <h1
        className="enter max-w-[14ch] text-[clamp(2.5rem,8.5vw,5.25rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-[var(--text)]"
        style={{ "--enter-delay": "80ms" } as CSSProperties}
      >
        {shared ? copy.sharedTitle : copy.title}
      </h1>
      <div
        className="enter mt-10 flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--border-strong)] px-6 py-20 text-center"
        style={{ "--enter-delay": "200ms" } as CSSProperties}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h2.2l2.2 11.1a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.1" />
            <circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="17" cy="20" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <p className="text-[1.125rem] font-medium tracking-[-0.01em] text-[var(--text)]">
          {shared ? (sharedFailed ? copy.checkFailed : copy.sharedEmpty) : copy.emptyTitle}
        </p>
        {!shared && (
          <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            {copy.emptyBody}
          </p>
        )}
        <Link href={routeFor("home", locale)} className={`mt-2 ${PRIMARY_BUTTON}`}>
          {copy.browse}
        </Link>
      </div>
    </div>
  );
}
