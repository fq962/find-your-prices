'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import {
  MINUTES_PER_DAY,
  describeSchedule,
  fromLocalInputValue,
  joinFrequency,
  splitFrequency,
  toLocalInputValue,
  type FrequencyParts,
} from '@/lib/schedule';
import type { RunSummary, StoreOption, StrategyOption, TargetHealth } from './types';

/**
 * Panel de administración del scraping.
 *
 * ---------------------------------------------------------------------------
 * Criterio de diseño
 * ---------------------------------------------------------------------------
 * Un panel operativo no tiene por qué parecer una hoja de cálculo. La decisión
 * central acá es de jerarquía: la cifra que importa —cuántos artículos se están
 * vigilando ahora mismo— se pone en escala monumental (hasta 13rem) contra
 * etiquetas de 11px. Ese contraste de 12:1 hace que la pantalla se entienda de
 * un vistazo, incluso de reojo desde el otro lado del escritorio.
 *
 * El resto sigue de esa decisión: composición asimétrica en vez de tarjetas
 * centradas, filas con línea de pelo en vez de cajas dentro de cajas, y una
 * entrada coreografiada que revela estructura → cifra → detalle, en ese orden.
 *
 * Todo el movimiento usa las curvas del sistema (`--ease-out-expo`,
 * `--ease-spring`): nunca `ease` ni `linear`, que delatan lo genérico.
 */

interface DashboardMetrics {
  trackedProducts: number;
  pricePoints: number;
  activeStores: number;
}

interface Props {
  targets: TargetHealth[];
  stores: StoreOption[];
  strategies: StrategyOption[];
  recentRuns: RunSummary[];
  metrics: DashboardMetrics;
  cronPath: string;
}

const KIND_LABELS: Record<string, string> = {
  full_catalog: 'Catálogo completo',
  category: 'Categoría',
  search: 'Búsqueda',
  product_detail: 'Ficha',
  sitemap: 'Sitemap',
  feed: 'Feed',
};

/** El estado se comunica con un punto de color, no con una píldora ruidosa. */
const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-500',
  partial: 'bg-amber-500',
  failed: 'bg-red-500',
  running: 'bg-[var(--accent)]',
  skipped: 'bg-[var(--text-tertiary)]',
  queued: 'bg-[var(--text-tertiary)]',
  cancelled: 'bg-[var(--text-tertiary)]',
};

const STATUS_TEXT: Record<string, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  partial: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  running: 'text-[var(--accent)]',
  skipped: 'text-[var(--text-tertiary)]',
  queued: 'text-[var(--text-tertiary)]',
  cancelled: 'text-[var(--text-tertiary)]',
};

/**
 * Zona horaria fija: el componente renderiza primero en el servidor y luego
 * hidrata. Sin esto Node usa la zona del servidor y el navegador la del
 * visitante, las cadenas difieren y React aborta la hidratación.
 */
const TIME_ZONE = 'America/Tegucigalpa';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

/** Distancia en lenguaje natural: "hace 6 min" se lee más rápido que una fecha. */
function formatRelative(value: string | null): string {
  if (!value) return 'nunca';
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

const numberFormatter = new Intl.NumberFormat('es-HN');

/**
 * La cifra sube desde cero al entrar.
 *
 * Es el único movimiento decorativo del panel y se lo gana: convierte un dato
 * estático en un gesto que dice "esto está vivo y creciendo". Respeta
 * `prefers-reduced-motion`, y ahí simplemente aparece el valor final.
 */
function useCountUp(target: number, durationMs = 1100, delayMs = 0): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || target === 0) {
      // Un frame de por medio en vez de setState síncrono en el efecto: el
      // resultado es idéntico a la vista y no dispara un render en cascada.
      frame.current = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame.current);
    }

    let start: number | null = null;
    const timer = setTimeout(() => {
      const step = (timestamp: number) => {
        if (start === null) start = timestamp;
        const progress = Math.min((timestamp - start) / durationMs, 1);
        // Mismo expo-out que las transiciones del sistema: frena al final en
        // vez de cortar en seco.
        const eased = 1 - Math.pow(1 - progress, 4);
        setValue(Math.round(target * eased));
        if (progress < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, delayMs]);

  return value;
}

export function ScrapingDashboard({
  targets,
  stores,
  strategies,
  recentRuns,
  metrics,
  cronPath,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyTargetId, setBusyTargetId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  /** Target abierto en modo edición. Solo uno a la vez: editar dos horarios en paralelo invita a equivocarse de fila. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  /**
   * Horario del formulario de alta. El ancla arranca vacía a propósito: poner
   * `new Date()` en el estado inicial de un componente que también se renderiza
   * en el servidor da una hora distinta en cada lado y rompe la hidratación.
   * Vacío significa "desde ahora", y eso lo resuelve el servidor.
   */
  const [newSchedule, setNewSchedule] = useState<ScheduleDraft>({
    frequencyMinutes: 720,
    anchor: '',
  });

  const trackedProducts = useCountUp(metrics.trackedProducts, 1200, 260);

  const summary = useMemo(() => {
    const failing = targets.filter((t) => t.last_status === 'failed').length;
    const paused = targets.filter((t) => !t.is_active).length;
    const lastRun = recentRuns[0]?.started_at ?? null;
    return { failing, paused, lastRun, active: targets.filter((t) => t.is_active).length };
  }, [targets, recentRuns]);

  /**
   * Activos y archivados van en listas separadas.
   *
   * Un target pausado no lo mira el cron: mezclarlo con los vivos obliga a leer
   * el punto de color de cada fila para saber qué se está rastreando de verdad.
   * Archivados abajo, plegados y con su cuenta a la vista.
   */
  const { activeTargets, archivedTargets } = useMemo(
    () => ({
      activeTargets: targets.filter((t) => t.is_active),
      archivedTargets: targets.filter((t) => !t.is_active),
    }),
    [targets],
  );

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `La petición falló con estado ${response.status}`);
    }
    return payload;
  }

  function withFeedback(targetId: string | null, action: () => Promise<string>) {
    setBusyTargetId(targetId);
    setMessage(null);
    action()
      .then((text) => {
        setMessage({ tone: 'ok', text });
        startTransition(() => router.refresh());
      })
      .catch((error: unknown) => {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => setBusyTargetId(null));
  }

  function handleRunNow(target: TargetHealth) {
    withFeedback(target.target_id, async () => {
      const payload = await call(`/api/scraping/targets/${target.target_id}/run`, { method: 'POST' });
      const r = payload.result;
      return `${target.target_name} · ${numberFormatter.format(r.itemsFound)} artículos · ${r.itemsNew} nuevos · ${r.priceChanges} cambios de precio · ${formatDuration(r.durationMs)}`;
    });
  }

  function handleToggle(target: TargetHealth) {
    withFeedback(target.target_id, async () => {
      await call(`/api/scraping/targets/${target.target_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !target.is_active }),
      });
      return `${target.target_name} ${target.is_active ? 'pausado' : 'reactivado'}`;
    });
  }

  function handleSaveEdit(target: TargetHealth, patch: Record<string, unknown>) {
    withFeedback(target.target_id, async () => {
      const payload = await call(`/api/scraping/targets/${target.target_id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setEditingId(null);
      // La respuesta trae la fila ya reprogramada por el servidor: se muestra
      // el horario que quedó de verdad, no el que el formulario suponía.
      const saved = payload.target as { frequency_minutes: number | null; schedule_anchor_at: string | null };
      return `${target.target_name} · ${describeSchedule(saved.schedule_anchor_at, saved.frequency_minutes)}`;
    });
  }

  function handleDelete(target: TargetHealth) {
    if (!window.confirm(`¿Eliminar el target "${target.target_name}"? No se puede deshacer.`)) return;
    withFeedback(target.target_id, async () => {
      await call(`/api/scraping/targets/${target.target_id}`, { method: 'DELETE' });
      return `${target.target_name} eliminado`;
    });
  }

  function handleCreate(formData: FormData) {
    const rawConfig = String(formData.get('config') ?? '').trim();
    let config: unknown = {};
    if (rawConfig) {
      try {
        config = JSON.parse(rawConfig);
      } catch {
        setMessage({ tone: 'error', text: 'La configuración no es JSON válido' });
        return;
      }
    }

    withFeedback(null, async () => {
      await call('/api/scraping/targets', {
        method: 'POST',
        body: JSON.stringify({
          store_id: formData.get('store_id'),
          name: formData.get('name'),
          kind: formData.get('kind'),
          url: formData.get('url') || null,
          frequency_minutes: Number(formData.get('frequency_minutes')) || 720,
          // El input no lleva zona: se interpreta como hora de Honduras antes
          // de mandarlo. Vacío deja que el servidor ancle en "ahora".
          schedule_anchor_at:
            fromLocalInputValue(String(formData.get('schedule_anchor_at') ?? ''))?.toISOString() ??
            null,
          config,
        }),
      });
      setShowForm(false);
      return 'Target creado';
    });
  }

  const busy = busyTargetId !== null || isPending;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ------------------------------------------------------------------
          Encabezado: el momento firma.
          La cifra sangra hacia la izquierda del contenedor y el bloque de
          contexto se desplaza a la derecha. Esa asimetría es deliberada —
          centrar todo habría sido seguro y olvidable.
         ------------------------------------------------------------------ */}
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-14 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p
            className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase"
            style={{ '--enter-delay': '80ms' } as CSSProperties}
          >
            Find Your Prices · Panel operativo ·{' '}
            <Link href="/admin/categorias" className="text-[var(--accent)] hover:opacity-70">
              Categorías
            </Link>
          </p>

          <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div
              className="enter min-w-0"
              style={{ '--enter-delay': '200ms' } as CSSProperties}
            >
              <span className="block text-[clamp(4.5rem,15vw,13rem)] leading-[0.82] font-semibold tracking-[-0.05em] tabular-nums text-[var(--text)]">
                {numberFormatter.format(trackedProducts)}
              </span>
              <span className="mt-5 block text-[0.8125rem] tracking-[0.02em] text-[var(--text-secondary)]">
                artículos vigilados en{' '}
                <span className="text-[var(--text)]">
                  {metrics.activeStores} {metrics.activeStores === 1 ? 'tienda' : 'tiendas'}
                </span>
              </span>
            </div>

            {/* Columna de contexto: cifras secundarias en una escala muy por
                debajo de la principal, para que no compitan. */}
            <dl
              className="enter grid shrink-0 grid-cols-3 gap-x-10 gap-y-1 lg:pb-3"
              style={{ '--enter-delay': '340ms' } as CSSProperties}
            >
              <Metric label="Precios" value={numberFormatter.format(metrics.pricePoints)} />
              <Metric label="Targets" value={`${summary.active}/${targets.length}`} />
              <Metric
                label="Con fallo"
                value={String(summary.failing)}
                tone={summary.failing > 0 ? 'alert' : undefined}
              />
            </dl>
          </div>

          <p
            className="enter-fade mt-12 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]"
            style={{ '--enter-delay': '460ms' } as CSSProperties}
          >
            Cada target es una url o listado que se rastrea con una estrategia y una frecuencia. El
            cron llama a{' '}
            <code className="rounded-md bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[0.8125em] text-[var(--text)]">
              {cronPath}
            </code>{' '}
            y ejecuta todo lo vencido. Última corrida {formatRelative(summary.lastRun)}.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-32 sm:px-10 lg:px-16">
        {/* Aviso de resultado. Entra con un desplazamiento corto, no con un
            fundido plano: el movimiento hace que se note sin gritar. */}
        {message && (
          <div
            role="status"
            className={`mt-10 flex items-start gap-3 border-l-2 py-3 pl-4 text-[0.875rem] ${
              message.tone === 'ok'
                ? 'border-emerald-500 text-[var(--text)]'
                : 'border-red-500 text-red-600 dark:text-red-400'
            }`}
            style={{ animation: 'fyp-rise 420ms var(--ease-out-expo) both' }}
          >
            <span className="tabular-nums">{message.text}</span>
          </div>
        )}

        {/* ---------------------------------------------------------------
            Targets
           --------------------------------------------------------------- */}
        <section className="mt-16">
          <div
            className="enter-fade flex items-baseline justify-between gap-6 border-b border-[var(--border)] pb-4"
            style={{ '--enter-delay': '560ms' } as CSSProperties}
          >
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-[var(--text)]">
              Targets
            </h2>
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="group flex items-center gap-2 rounded-full text-[0.8125rem] font-medium text-[var(--accent)] outline-none transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                className={`h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] ${
                  showForm ? 'rotate-45' : ''
                }`}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {showForm ? 'Cancelar' : 'Nuevo target'}
            </button>
          </div>

          {showForm && (
            <form
              action={handleCreate}
              className="grid gap-x-8 gap-y-6 border-b border-[var(--border)] py-8 sm:grid-cols-2"
              style={{ animation: 'fyp-rise 480ms var(--ease-out-expo) both' }}
            >
              <Field label="Tienda">
                <select name="store_id" required className={inputClass}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} · {store.strategy_key}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Nombre">
                <input
                  name="name"
                  required
                  placeholder="Diunsa · Electrodomésticos"
                  className={inputClass}
                />
              </Field>

              <Field label="Tipo">
                <select name="kind" defaultValue="category" className={inputClass}>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <ScheduleControls
                frequencyMinutes={newSchedule.frequencyMinutes}
                anchorLocal={newSchedule.anchor}
                onChange={setNewSchedule}
                anchorLabel="Primera corrida"
                anchorHint="Vacío = a partir de ahora. La hora es de Honduras."
              />
              <input type="hidden" name="frequency_minutes" value={newSchedule.frequencyMinutes} />
              <input type="hidden" name="schedule_anchor_at" value={newSchedule.anchor} />

              <Field
                label="URL pública"
                hint="Referencia para humanos; algunas estrategias la descargan."
              >
                <input
                  name="url"
                  type="url"
                  placeholder="https://www.diunsa.hn/jugueteria"
                  className={inputClass}
                />
              </Field>

              <Field
                label="Configuración (JSON)"
                hint={
                  strategies[0]
                    ? `${strategies[0].label} espera: ${strategies[0].configSchema
                        .map((f) => f.key)
                        .join(', ')}`
                    : undefined
                }
              >
                <textarea
                  name="config"
                  rows={3}
                  defaultValue='{ "groupCode": "258" }'
                  className={`${inputClass} font-mono text-[0.8125rem]`}
                />
              </Field>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
                >
                  Crear target
                </button>
              </div>
            </form>
          )}

          {targets.length === 0 ? (
            <EmptyState
              title="Todavía no hay nada que rastrear"
              body="Registrá el primer target para que el cron tenga trabajo. Necesitás una tienda dada de alta y la configuración que pida su estrategia."
              action="Nuevo target"
              onAction={() => setShowForm(true)}
            />
          ) : activeTargets.length === 0 ? (
            <EmptyState
              title="Todo está archivado"
              body="Ningún target activo: el cron no tiene qué hacer. Reactivá alguno desde los archivados, abajo."
            />
          ) : (
            <ul>
              {activeTargets.map((target, index) => (
                <TargetRow
                  key={target.target_id}
                  target={target}
                  delayMs={640 + index * 70}
                  busy={busy}
                  busyTargetId={busyTargetId}
                  isEditing={editingId === target.target_id}
                  onEdit={() => setEditingId(target.target_id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(patch) => handleSaveEdit(target, patch)}
                  onRunNow={() => handleRunNow(target)}
                  onToggle={() => handleToggle(target)}
                  onDelete={() => handleDelete(target)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------
            Archivados

            Un target pausado no lo mira el cron. Vive acá abajo, plegado, en
            vez de mezclado entre los vivos: la lista de arriba tiene que poder
            leerse como "esto es lo que se está rastreando", sin excepciones.
           --------------------------------------------------------------- */}
        {archivedTargets.length > 0 && (
          <section className="mt-20">
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              aria-expanded={showArchived}
              className="group flex w-full items-baseline justify-between gap-6 border-b border-[var(--border)] pb-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-[1.75rem] font-semibold tracking-[-0.03em] text-[var(--text-tertiary)]">
                  Archivados
                </span>
                <span className="text-[0.9375rem] text-[var(--text-tertiary)] tabular-nums">
                  {archivedTargets.length}
                </span>
              </span>
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--accent)] transition-opacity duration-[var(--dur-base)] group-hover:opacity-70">
                {showArchived ? 'Ocultar' : 'Mostrar'}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] ${
                    showArchived ? 'rotate-180' : ''
                  }`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>

            {showArchived && (
              <>
                <p className="pt-4 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                  Pausados a mano o por el circuit breaker tras demasiados fallos seguidos. El cron
                  los ignora hasta que se reactiven; su historial de corridas se conserva.
                </p>
                <ul className="mt-2">
                  {archivedTargets.map((target, index) => (
                    <TargetRow
                      key={target.target_id}
                      target={target}
                      delayMs={index * 60}
                      busy={busy}
                      busyTargetId={busyTargetId}
                      isEditing={editingId === target.target_id}
                      onEdit={() => setEditingId(target.target_id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSave={(patch) => handleSaveEdit(target, patch)}
                      onRunNow={() => handleRunNow(target)}
                      onToggle={() => handleToggle(target)}
                      onDelete={() => handleDelete(target)}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------------
            Bitácora
           --------------------------------------------------------------- */}
        <section className="mt-24">
          <h2 className="border-b border-[var(--border)] pb-4 text-[1.75rem] font-semibold tracking-[-0.03em] text-[var(--text)]">
            Bitácora
          </h2>

          {recentRuns.length === 0 ? (
            <EmptyState
              title="Sin corridas todavía"
              body="Cuando el cron o el botón Ejecutar disparen la primera corrida, acá queda el registro con duración, artículos y errores."
            />
          ) : (
            <ul className="mt-2">
              {recentRuns.map((run) => (
                <li
                  key={run.id}
                  className="grid grid-cols-2 items-baseline gap-x-6 gap-y-1 border-b border-[var(--border)] py-4 text-[0.875rem] sm:grid-cols-6"
                >
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {formatDateTime(run.started_at)}
                  </span>
                  <span className={`flex items-center gap-2 ${STATUS_TEXT[run.status] ?? ''}`}>
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[run.status] ?? STATUS_DOT.queued}`}
                    />
                    {run.status}
                  </span>
                  <span className="text-[var(--text-tertiary)]">{run.trigger_source}</span>
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {formatDuration(run.duration_ms)}
                  </span>
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {numberFormatter.format(run.items_found)} art.
                  </span>
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {run.price_changes} precios
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Piezas
   ------------------------------------------------------------------------- */

const inputClass =
  'w-full border-0 border-b border-[var(--border-strong)] bg-transparent px-0 py-2 text-[0.9375rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]';

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'alert' }) {
  return (
    <div>
      <dt className="text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-[1.375rem] font-medium tracking-[-0.02em] tabular-nums ${
          tone === 'alert' ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <>
      <p className="text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
        {label}
      </p>
      <p className={`mt-1 text-[0.9375rem] tabular-nums ${tone ?? 'text-[var(--text)]'}`}>{value}</p>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-2 block text-[0.75rem] text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

/** El vacío también es una pantalla diseñada: dice qué pasa y qué hacer. */
function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="border-b border-[var(--border)] py-24 text-center">
      <p className="text-[1.25rem] font-medium tracking-[-0.02em] text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-[0.98]"
        >
          {action}
        </button>
      )}
    </div>
  );
}

function RowAction({
  children,
  onClick,
  disabled,
  busy,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm text-[0.8125rem] outline-none transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:opacity-60 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)] ${
        tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]'
      }`}
    >
      {busy ? 'corriendo…' : children}
    </button>
  );
}
/* -------------------------------------------------------------------------
   Agenda
   ------------------------------------------------------------------------- */

/**
 * Horario en edición.
 *
 * `anchor` es el texto crudo de un `<input type="datetime-local">`, sin zona.
 * Se interpreta siempre como hora de Honduras al mandarlo (ver `src/lib/schedule.ts`);
 * vacío significa "desde ahora" y lo resuelve el servidor.
 */
export interface ScheduleDraft {
  frequencyMinutes: number;
  anchor: string;
}

const FREQUENCY_UNITS: Array<{ value: FrequencyParts['unit']; label: string }> = [
  { value: 'minutes', label: 'minutos' },
  { value: 'hours', label: 'horas' },
  { value: 'days', label: 'días' },
  { value: 'weeks', label: 'semanas' },
];

/**
 * El par intervalo + ancla, con la frase que resulta debajo.
 *
 * La frase no es decoración: "cada 7 días desde el 15/09 08:00" y "cada lunes a
 * las 08:00" son el mismo dato, pero solo la segunda deja ver que te
 * equivocaste de día. Es la única forma de que el operador confirme lo que va a
 * quedar guardado antes de guardarlo.
 */
function ScheduleControls({
  frequencyMinutes,
  anchorLocal,
  onChange,
  anchorLabel = 'Ancla del horario',
  anchorHint,
}: {
  frequencyMinutes: number;
  anchorLocal: string;
  onChange: (draft: ScheduleDraft) => void;
  anchorLabel?: string;
  anchorHint?: string;
}) {
  const parts = splitFrequency(frequencyMinutes);
  const anchorIso = anchorLocal ? (fromLocalInputValue(anchorLocal)?.toISOString() ?? null) : null;

  return (
    <>
      <Field label="Ritmo">
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            value={parts.value}
            onChange={(event) =>
              onChange({
                frequencyMinutes: joinFrequency({
                  value: Math.max(1, Number(event.target.value) || 1),
                  unit: parts.unit,
                }),
                anchor: anchorLocal,
              })
            }
            className={`${inputClass} w-20 shrink-0`}
            aria-label="Cada cuántas unidades"
          />
          <select
            value={parts.unit}
            onChange={(event) =>
              onChange({
                frequencyMinutes: joinFrequency({
                  value: parts.value,
                  unit: event.target.value as FrequencyParts['unit'],
                }),
                anchor: anchorLocal,
              })
            }
            // `flex-1 min-w-0` y no el `w-full` de inputClass a secas: dentro de
            // un flex, width:100% se mide contra el contenedor entero y el
            // select se desborda encima de la columna de al lado.
            className={`${inputClass} min-w-0 flex-1`}
            aria-label="Unidad del ritmo"
          >
            {FREQUENCY_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label={anchorLabel} hint={anchorHint}>
        <input
          type="datetime-local"
          value={anchorLocal}
          onChange={(event) => onChange({ frequencyMinutes, anchor: event.target.value })}
          className={inputClass}
        />
      </Field>

      <p className="text-[0.8125rem] text-[var(--text-secondary)] sm:col-span-2">
        Queda:{' '}
        <span className="font-medium text-[var(--text)]">
          {anchorIso
            ? describeSchedule(anchorIso, frequencyMinutes)
            : `${describeSchedule(new Date(0), frequencyMinutes).replace(/ \(desde.*\)$/, '')}, a partir de ahora`}
        </span>
        {anchorIso && frequencyMinutes >= MINUTES_PER_DAY && (
          <span className="text-[var(--text-tertiary)]">
            {' '}
            · anclá unos minutos antes de la hora del cron para que la corrida ya esté vencida
            cuando dispare
          </span>
        )}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------
   Fila de target
   ------------------------------------------------------------------------- */

function TargetRow({
  target,
  delayMs,
  busy,
  busyTargetId,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onRunNow,
  onToggle,
  onDelete,
}: {
  target: TargetHealth;
  delayMs: number;
  busy: boolean;
  busyTargetId: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onRunNow: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className="enter group border-b border-[var(--border)]"
      style={{ '--enter-delay': `${delayMs}ms` } as CSSProperties}
    >
      <div className="grid grid-cols-1 items-start gap-4 py-7 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] md:grid-cols-12 md:items-center">
        {/* Identidad: lo único que crece en escala dentro de la fila. */}
        <div className="md:col-span-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                target.is_active
                  ? (STATUS_DOT[target.last_status ?? 'queued'] ?? STATUS_DOT.queued)
                  : 'bg-[var(--text-tertiary)]'
              }`}
            />
            <h3 className="truncate text-[1.0625rem] font-medium tracking-[-0.015em] text-[var(--text)]">
              {target.target_name}
            </h3>
          </div>
          <p className="mt-1.5 pl-4 text-[0.75rem] tracking-[0.06em] text-[var(--text-tertiary)] uppercase">
            {KIND_LABELS[target.kind] ?? target.kind} · {target.strategy_key}
          </p>
          {!target.is_active && target.paused_reason && (
            <p className="mt-2 pl-4 text-[0.75rem] leading-relaxed text-amber-600 dark:text-amber-400">
              {target.paused_reason}
            </p>
          )}
        </div>

        {/* Ritmo, dicho como lo entiende un humano y no en minutos. */}
        <div className="md:col-span-2">
          <Cell label="Ritmo" value={describeSchedule(target.schedule_anchor_at, target.frequency_minutes)} />
          <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)] tabular-nums">
            {target.is_active ? `próxima ${formatDateTime(target.next_run_at)}` : 'archivado'}
          </p>
        </div>

        {/* Última corrida */}
        <div className="md:col-span-2">
          <Cell
            label="Última"
            value={formatRelative(target.last_run_at)}
            tone={target.last_status ? STATUS_TEXT[target.last_status] : undefined}
          />
          <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)] tabular-nums">
            {target.last_status ?? 'sin correr'} · {formatDuration(target.last_duration_ms)}
          </p>
        </div>

        {/* Resultado */}
        <div className="md:col-span-2">
          {target.last_items_found !== null ? (
            <>
              <Cell label="Resultado" value={numberFormatter.format(target.last_items_found)} />
              <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)] tabular-nums">
                {target.last_items_new} nuevos · {target.last_price_changes} precios
              </p>
            </>
          ) : (
            <Cell label="Resultado" value="—" />
          )}
          {target.last_error_message && (
            <p
              className="mt-1 truncate text-[0.75rem] text-red-600 dark:text-red-400"
              title={target.last_error_message}
            >
              {target.last_error_message}
            </p>
          )}
        </div>

        {/* Acciones: aparecen al enfocar la fila, para que la lista
            se lea limpia en reposo. En táctil siempre visibles. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-2 md:justify-end md:opacity-40 md:transition-opacity md:duration-[var(--dur-base)] md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <RowAction onClick={onRunNow} disabled={busy} busy={busyTargetId === target.target_id}>
            Ejecutar
          </RowAction>
          <RowAction onClick={isEditing ? onCancelEdit : onEdit} disabled={busy}>
            {isEditing ? 'Cerrar' : 'Editar'}
          </RowAction>
          <RowAction onClick={onToggle} disabled={busy}>
            {target.is_active ? 'Archivar' : 'Reactivar'}
          </RowAction>
          <RowAction onClick={onDelete} disabled={busy} tone="danger">
            Eliminar
          </RowAction>
        </div>
      </div>

      {isEditing && <TargetEditor target={target} busy={busy} onCancel={onCancelEdit} onSave={onSave} />}
    </li>
  );
}

/**
 * Edición en la propia fila.
 *
 * Se manda solo lo que cambió: un PATCH con los seis campos siempre pisaría el
 * `config` que alguien haya tocado por API mientras el formulario estaba
 * abierto. Y el `next_run_at` no se manda nunca desde acá — lo recalcula el
 * servidor a partir del ancla y el intervalo, que es el único lugar donde esa
 * regla debe vivir.
 */
function TargetEditor({
  target,
  busy,
  onCancel,
  onSave,
}: {
  target: TargetHealth;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(target.target_name);
  const [schedule, setSchedule] = useState<ScheduleDraft>({
    frequencyMinutes: target.frequency_minutes ?? 720,
    anchor: toLocalInputValue(target.schedule_anchor_at ?? target.next_run_at),
  });
  const [priority, setPriority] = useState(String(target.priority ?? 100));
  const [maxPages, setMaxPages] = useState(target.max_pages === null ? '' : String(target.max_pages));
  const [config, setConfig] = useState(() => JSON.stringify(target.config ?? {}, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    let parsedConfig: unknown;
    try {
      parsedConfig = config.trim() ? JSON.parse(config) : {};
    } catch {
      setConfigError('No es JSON válido');
      return;
    }
    setConfigError(null);

    const anchorIso = fromLocalInputValue(schedule.anchor)?.toISOString() ?? null;
    const patch: Record<string, unknown> = {};

    if (name.trim() && name.trim() !== target.target_name) patch.name = name.trim();
    if (schedule.frequencyMinutes !== target.frequency_minutes) {
      patch.frequency_minutes = schedule.frequencyMinutes;
    }
    if (anchorIso && anchorIso !== target.schedule_anchor_at) patch.schedule_anchor_at = anchorIso;

    const priorityValue = Number(priority);
    if (Number.isFinite(priorityValue) && priorityValue !== target.priority) {
      patch.priority = Math.trunc(priorityValue);
    }

    const maxPagesValue = maxPages.trim() === '' ? null : Math.trunc(Number(maxPages));
    if (maxPagesValue !== target.max_pages && (maxPagesValue === null || maxPagesValue > 0)) {
      patch.max_pages = maxPagesValue;
    }

    if (JSON.stringify(parsedConfig) !== JSON.stringify(target.config ?? {})) {
      patch.config = parsedConfig;
    }

    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-x-8 gap-y-6 border-t border-[var(--border)] py-8 sm:grid-cols-2"
      style={{ animation: 'fyp-rise 420ms var(--ease-out-expo) both' }}
    >
      <Field label="Nombre">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>

      <Field label="Prioridad" hint="Menor corre primero cuando varios vencen en la misma tanda.">
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={inputClass}
        />
      </Field>

      <ScheduleControls
        frequencyMinutes={schedule.frequencyMinutes}
        anchorLocal={schedule.anchor}
        onChange={setSchedule}
        anchorHint="Define el día y la hora exactos de la rejilla. Hora de Honduras."
      />

      <Field label="Máx. páginas" hint="Tope de peticiones por corrida. Vacío = sin tope propio.">
        <input
          type="number"
          min={1}
          value={maxPages}
          onChange={(e) => setMaxPages(e.target.value)}
          placeholder="sin tope"
          className={inputClass}
        />
      </Field>

      <Field label="Configuración (JSON)" hint={configError ?? undefined}>
        <textarea
          rows={4}
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          className={`${inputClass} font-mono text-[0.8125rem] ${
            configError ? 'border-red-500' : ''
          }`}
        />
      </Field>

      <div className="flex items-center gap-5 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[0.8125rem] text-[var(--text-secondary)] transition-opacity duration-[var(--dur-fast)] hover:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
