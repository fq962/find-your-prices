import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { listStrategies } from '@/server/scraping/registry';
import { ScrapingDashboard } from '@/features/admin-scraping/ScrapingDashboard';
import type { RunSummary, StoreOption, TargetHealth } from '@/features/admin-scraping/types';

/**
 * Panel de scraping.
 *
 * Los datos se leen aqui, en el servidor, con la service key: el navegador
 * nunca ve credenciales de Supabase. Las acciones (crear, correr, pausar) van
 * contra /api/scraping/*.
 *
 * La ruta esta abierta a proposito en esta etapa. Cuando entre OAuth: proteger
 * este segmento y definir ADMIN_API_SECRET para cerrar tambien la API.
 */

export const metadata: Metadata = {
  title: 'Panel de scraping',
  robots: { index: false, follow: false },
};

// Siempre datos frescos: es un tablero operativo.
export const dynamic = 'force-dynamic';

interface LoadResult {
  targets: TargetHealth[];
  stores: StoreOption[];
  recentRuns: RunSummary[];
  error: string | null;
}

async function loadDashboardData(): Promise<LoadResult> {
  try {
    const db = getSupabaseAdmin();

    const [targetsResult, storesResult, runsResult] = await Promise.all([
      db
        .from('v_scrape_target_health')
        .select('*')
        .order('store_name', { ascending: true })
        .order('target_name', { ascending: true }),
      db.from('stores').select('id, slug, name, strategy_key, is_active').order('name'),
      db.from('scrape_runs').select('*').order('started_at', { ascending: false }).limit(20),
    ]);

    const failure = targetsResult.error ?? storesResult.error ?? runsResult.error;
    if (failure) throw new Error(failure.message);

    return {
      targets: (targetsResult.data ?? []) as TargetHealth[],
      stores: (storesResult.data ?? []) as StoreOption[],
      recentRuns: (runsResult.data ?? []) as RunSummary[],
      error: null,
    };
  } catch (error) {
    // Antes de correr las migraciones el esquema no existe: se muestra el
    // motivo en pantalla en vez de romper la pagina entera.
    return {
      targets: [],
      stores: [],
      recentRuns: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function ScrapingAdminPage() {
  const { targets, stores, recentRuns, error } = await loadDashboardData();

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Panel de scraping</h1>
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/8 p-6">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            No se pudo leer la base de datos
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{error}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
            <li>
              Corriste las migraciones de{' '}
              <code className="rounded bg-[var(--bg-inset)] px-1">src/db/migrations</code> en orden?
            </li>
            <li>
              Agregaste <code className="rounded bg-[var(--bg-inset)] px-1">find_your_prices</code> en
              Supabase → Settings → API → Exposed schemas?
            </li>
            <li>
              Estan <code className="rounded bg-[var(--bg-inset)] px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
              <code className="rounded bg-[var(--bg-inset)] px-1">SUPABASE_SECRET_KEY</code> en
              .env.local?
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <ScrapingDashboard
      targets={targets}
      stores={stores}
      strategies={listStrategies()}
      recentRuns={recentRuns}
      cronPath="/api/scraping/run?secret=…"
    />
  );
}
