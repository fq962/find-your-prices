'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { RunSummary, StoreOption, StrategyOption, TargetHealth } from './types';

/**
 * Panel de administracion del scraping.
 *
 * Se alimenta de datos que resuelve el servidor y opera contra
 * /api/scraping/*. Sin auth por ahora, tal como se definio para esta etapa:
 * cuando entre OAuth basta con proteger la ruta y definir ADMIN_API_SECRET.
 */

interface Props {
  targets: TargetHealth[];
  stores: StoreOption[];
  strategies: StrategyOption[];
  recentRuns: RunSummary[];
  cronPath: string;
}

const KIND_LABELS: Record<string, string> = {
  full_catalog: 'Catalogo completo',
  category: 'Categoria',
  search: 'Busqueda',
  product_detail: 'Ficha de producto',
  sitemap: 'Sitemap',
  feed: 'Feed',
};

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  partial: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/12 text-red-600 dark:text-red-400',
  running: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  skipped: 'bg-neutral-500/12 text-[var(--text-tertiary)]',
  queued: 'bg-neutral-500/12 text-[var(--text-tertiary)]',
  cancelled: 'bg-neutral-500/12 text-[var(--text-tertiary)]',
};

/**
 * La zona horaria se fija a proposito.
 *
 * Este componente se renderiza primero en el servidor y luego hidrata en el
 * navegador. Sin `timeZone` explicito, Node usa la del servidor y el navegador
 * la del visitante: las dos cadenas salen distintas y React aborta la
 * hidratacion. Ademas el panel es operativo para Honduras, asi que la hora
 * correcta es la de Honduras aunque se mire desde otro pais.
 */
const PANEL_TIME_ZONE = 'America/Tegucigalpa';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PANEL_TIME_ZONE,
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatFrequency(minutes: number | null): string {
  if (!minutes) return 'manual';
  if (minutes % 1440 === 0) return `cada ${minutes / 1440} d`;
  if (minutes % 60 === 0) return `cada ${minutes / 60} h`;
  return `cada ${minutes} min`;
}

export function ScrapingDashboard({ targets, stores, strategies, recentRuns, cronPath }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyTargetId, setBusyTargetId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const totals = useMemo(
    () => ({
      targets: targets.length,
      active: targets.filter((t) => t.is_active).length,
      failing: targets.filter((t) => t.last_status === 'failed').length,
      products: stores.reduce((sum, store) => {
        const row = targets.find((t) => t.store_id === store.id);
        return sum + (row?.store_active_products ?? 0);
      }, 0),
    }),
    [targets, stores],
  );

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `La peticion fallo con estado ${response.status}`);
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
      const result = payload.result;
      return `${target.target_name}: ${result.itemsFound} articulos · ${result.itemsNew} nuevos · ${result.itemsUpdated} actualizados · ${result.priceChanges} cambios de precio (${formatDuration(result.durationMs)})`;
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

  function handleDelete(target: TargetHealth) {
    if (!window.confirm(`Eliminar el target "${target.target_name}"? Esta accion no se puede deshacer.`)) {
      return;
    }
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
        setMessage({ tone: 'error', text: 'La configuracion no es JSON valido' });
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
          config,
        }),
      });
      setShowForm(false);
      return 'Target creado';
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Administracion</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Scraping</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Cada target es una url o listado que se rastrea con una estrategia y una frecuencia. El cron
          externo llama a{' '}
          <code className="rounded bg-[var(--bg-inset)] px-1.5 py-0.5 text-[0.8em]">{cronPath}</code> y
          ejecuta todo lo que ya vencio.
        </p>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Targets" value={totals.targets} />
        <Stat label="Activos" value={totals.active} />
        <Stat label="Con fallo" value={totals.failing} tone={totals.failing > 0 ? 'alert' : undefined} />
        <Stat label="Tiendas" value={stores.length} />
      </section>

      {message && (
        <div
          role="status"
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            message.tone === 'ok'
              ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
              : 'border-red-500/25 bg-red-500/8 text-red-700 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Targets</h2>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--accent-hover)]"
        >
          {showForm ? 'Cancelar' : 'Nuevo target'}
        </button>
      </section>

      {showForm && (
        <form
          action={handleCreate}
          className="mb-10 grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 sm:grid-cols-2"
        >
          <Field label="Tienda">
            <select name="store_id" required className={inputClass}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.strategy_key})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nombre">
            <input name="name" required placeholder="Diunsa - Electrodomesticos" className={inputClass} />
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

          <Field label="Frecuencia (minutos)">
            <input
              name="frequency_minutes"
              type="number"
              min={1}
              defaultValue={720}
              className={inputClass}
            />
          </Field>

          <Field label="URL publica" hint="Referencia para humanos; algunas estrategias la usan para descargar.">
            <input name="url" type="url" placeholder="https://www.diunsa.hn/jugueteria" className={inputClass} />
          </Field>

          <Field
            label="Configuracion (JSON)"
            hint={
              strategies[0]
                ? `Ej. para ${strategies[0].label}: ${strategies[0].configSchema
                    .filter((f) => f.required)
                    .map((f) => `"${f.key}": "${f.example ?? ''}"`)
                    .join(', ')}`
                : undefined
            }
          >
            <textarea
              name="config"
              rows={3}
              defaultValue='{ "groupCode": "258" }'
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isPending || busyTargetId !== null}
              className="rounded-full bg-[var(--text)] px-5 py-2.5 text-sm font-medium text-[var(--text-inverted)] transition-opacity duration-[var(--dur-fast)] disabled:opacity-50"
            >
              Crear target
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
            <tr>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Frecuencia</th>
              <th className="px-4 py-3 font-medium">Proxima</th>
              <th className="px-4 py-3 font-medium">Ultima corrida</th>
              <th className="px-4 py-3 font-medium">Resultado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                  Aun no hay targets registrados.
                </td>
              </tr>
            )}

            {targets.map((target) => (
              <tr key={target.target_id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-4">
                  <div className="font-medium text-[var(--text)]">{target.target_name}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {target.store_name} · {KIND_LABELS[target.kind] ?? target.kind} · {target.strategy_key}
                  </div>
                  {!target.is_active && (
                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      Pausado{target.paused_reason ? `: ${target.paused_reason}` : ''}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-[var(--text-secondary)]">
                  {formatFrequency(target.frequency_minutes)}
                </td>
                <td className="px-4 py-4 text-[var(--text-secondary)]">
                  {target.is_active ? formatDateTime(target.next_run_at) : '—'}
                </td>
                <td className="px-4 py-4">
                  <div className="text-[var(--text-secondary)]">{formatDateTime(target.last_run_at)}</div>
                  <div className="mt-1 flex items-center gap-2">
                    {target.last_status && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[target.last_status] ?? STATUS_STYLES.queued
                        }`}
                      >
                        {target.last_status}
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {formatDuration(target.last_duration_ms)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-xs text-[var(--text-secondary)]">
                  {target.last_items_found !== null ? (
                    <>
                      <div>{target.last_items_found} articulos</div>
                      <div className="text-[var(--text-tertiary)]">
                        {target.last_items_new} nuevos · {target.last_items_updated} actualizados ·{' '}
                        {target.last_price_changes} precios
                      </div>
                    </>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">sin datos</span>
                  )}
                  {target.last_error_message && (
                    <div className="mt-1 max-w-xs truncate text-red-600 dark:text-red-400" title={target.last_error_message}>
                      {target.last_error_message}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <ActionButton
                      onClick={() => handleRunNow(target)}
                      disabled={busyTargetId !== null || isPending}
                      busy={busyTargetId === target.target_id}
                    >
                      Ejecutar
                    </ActionButton>
                    <ActionButton onClick={() => handleToggle(target)} disabled={busyTargetId !== null}>
                      {target.is_active ? 'Pausar' : 'Reactivar'}
                    </ActionButton>
                    <ActionButton onClick={() => handleDelete(target)} disabled={busyTargetId !== null} tone="danger">
                      Eliminar
                    </ActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Ultimas corridas</h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-3 font-medium">Inicio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Duracion</th>
                <th className="px-4 py-3 font-medium">Articulos</th>
                <th className="px-4 py-3 font-medium">Precios</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                    Todavia no se ha ejecutado ninguna corrida.
                  </td>
                </tr>
              )}
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDateTime(run.started_at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[run.status] ?? STATUS_STYLES.queued
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{run.trigger_source}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDuration(run.duration_ms)}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {run.items_found} · <span className="text-[var(--text-tertiary)]">{run.items_new} nuevos</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{run.price_changes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] focus:border-[var(--accent)]';

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
      <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'alert' }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
      <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === 'alert' ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
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
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--dur-fast)] disabled:opacity-40 ${
        tone === 'danger'
          ? 'border-red-500/25 text-red-600 hover:bg-red-500/8 dark:text-red-400'
          : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
      }`}
    >
      {busy ? 'Corriendo…' : children}
    </button>
  );
}
