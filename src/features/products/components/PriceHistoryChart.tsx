import type { PricePointRow } from "@/server/services/catalog";
import { formatPrice } from "@/lib/format";

export interface PriceHistoryChartProps {
  history: PricePointRow[];
  currency: string;
  locale?: string;
  labels: {
    title: string;
    trackingSince: string;
    notEnoughData: string;
    lowest: string;
    highest: string;
    current: string;
  };
}

/**
 * Histórico de precio.
 *
 * SVG dibujado a mano, sin librería de gráficos: son dos polilíneas y unos
 * ejes: traer una dependencia de 50 KB para esto sería peor por todos lados.
 *
 * Decisión importante: cuando hay menos de dos observaciones distintas NO se
 * dibuja una línea plana. Un gráfico plano parece un precio estable y vigilado
 * durante meses, cuando en realidad significa "todavía no tenemos histórico".
 * En ese caso se dice explícitamente desde cuándo se está observando. El valor
 * de este proyecto es que la gente confíe en los precios; simular datos que no
 * existen lo destruiría.
 */
export function PriceHistoryChart({
  history,
  currency,
  locale,
  labels,
}: PriceHistoryChartProps) {
  const points = history.filter(
    (point): point is PricePointRow & { price: number } => point.price !== null,
  );

  const distinctPrices = new Set(points.map((point) => point.price));

  if (points.length < 2 || distinctPrices.size < 2) {
    const since = points[0]?.scrapedAt ?? history[0]?.scrapedAt;
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-strong)] px-5 py-6">
        <p className="text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
          {labels.title}
        </p>
        <p className="mt-2 text-[0.9375rem] text-[var(--text-secondary)]">
          {labels.notEnoughData}
        </p>
        {since && (
          <p className="mt-1 text-[0.8125rem] text-[var(--text-tertiary)]">
            {labels.trackingSince}{" "}
            {new Date(since).toLocaleDateString("es-HN", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "America/Tegucigalpa",
            })}
          </p>
        )}
      </div>
    );
  }

  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const current = prices[prices.length - 1];
  // Un rango de cero rompería la división; además conviene un poco de aire
  // arriba y abajo para que la línea no toque los bordes.
  const range = max - min || max || 1;

  const WIDTH = 640;
  const HEIGHT = 160;
  const PAD_Y = 16;

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? WIDTH / 2 : (index / (points.length - 1)) * WIDTH;
    const y = HEIGHT - PAD_Y - ((point.price - min) / range) * (HEIGHT - PAD_Y * 2);
    return { x, y, point };
  });

  const line = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${coords[0].x},${HEIGHT} ${line} ${coords[coords.length - 1].x},${HEIGHT}`;

  const isDown = current <= prices[0];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
          {labels.title}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] tabular-nums">
          <span className="text-[var(--text-tertiary)]">
            {labels.lowest}{" "}
            <span className="text-[var(--text)]">{formatPrice(min, currency, locale)}</span>
          </span>
          <span className="text-[var(--text-tertiary)]">
            {labels.highest}{" "}
            <span className="text-[var(--text)]">{formatPrice(max, currency, locale)}</span>
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 h-40 w-full overflow-visible"
        role="img"
        aria-label={`${labels.title}: ${labels.lowest} ${formatPrice(min, currency, locale)}, ${labels.highest} ${formatPrice(max, currency, locale)}, ${labels.current} ${formatPrice(current, currency, locale)}`}
      >
        <defs>
          <linearGradient id="fyp-price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon points={area} fill="url(#fyp-price-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Solo se marca el punto actual: marcarlos todos convierte la línea en
            ruido cuando hay cien observaciones. */}
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r="4"
          fill="var(--accent)"
          stroke="var(--bg-elevated)"
          strokeWidth="2"
        />
      </svg>

      <p className="mt-2 text-[0.8125rem] text-[var(--text-secondary)] tabular-nums">
        {labels.current}{" "}
        <span className={isDown ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--text)]"}>
          {formatPrice(current, currency, locale)}
        </span>
      </p>
    </div>
  );
}
