/**
 * Barrido completo, SOLO PARA CORRER EN LOCAL.
 *
 * Corre todos los targets activos, uno por uno, sin importar su agenda y sin
 * techo de tiempo, subrequests ni CPU. Pensado para poner al dia el sitio
 * cuando el cron estuvo caido. Cada corrida queda en la bitacora con trigger
 * 'backfill' y, al terminar con exito, vuelve a su horario semanal normal.
 *
 *   npx --yes tsx@4 --conditions=react-server --env-file=.env.local scripts/scrape-all-local.ts
 *
 * Opciones:
 *   --store <slug>      solo los targets de esa tienda (repetible: --store paiz --store larach)
 *   --match <texto>     solo los targets cuyo nombre contenga el texto
 *   --due               solo los vencidos
 *   --include-paused    incluye los targets pausados
 *   --pause <seg>       espera entre targets (default 5)
 *   --dry               lista lo que correria y sale
 *
 * Traza: scrape-logs/<fecha>/
 *   run.log             todo lo que sale en consola, con hora
 *   <n>-<target>.json   resultado, log completo de la estrategia (info incluida)
 *                       y la fila final de scrape_runs
 *   summary.md          tabla final
 *
 * Ctrl+C una vez: termina el target en curso y se detiene. Dos veces: sale ya
 * (la corrida en curso queda en 'running' y se cierra sola a los 2 min).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';
import { getSupabaseAdmin } from '@/server/db/supabase';
import {
  publishCatalog,
  recoverStaleRuns,
  runTarget,
  type RunResult,
} from '@/server/scraping/runner';
import type { ScrapeTargetRow, StoreRow } from '@/server/scraping/types';

// Por target. Holgadisimo a proposito: aca nadie corta la conexion.
const TARGET_BUDGET_MS = 60 * 60_000;
// Cada cuantos targets se refresca el catalogo publico, para que el sitio se
// vaya actualizando sin esperar al final.
const PUBLISH_EVERY = 10;

// -----------------------------------------------------------------------------
// Argumentos
// -----------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const values = (name: string) =>
  argv.flatMap((arg, i) => (arg === name && argv[i + 1] ? [argv[i + 1]] : []));

const stores = values('--store').map((s) => s.toLowerCase());
const match = values('--match')[0]?.toLowerCase();
const onlyDue = flag('--due');
const includePaused = flag('--include-paused');
const dry = flag('--dry');
const pauseMs = (Number(values('--pause')[0]) || 5) * 1000;

// -----------------------------------------------------------------------------
// Traza: todo lo de consola tambien va a run.log
// -----------------------------------------------------------------------------

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logDir = join(process.cwd(), 'scrape-logs', stamp);
mkdirSync(logDir, { recursive: true });
const runLog = join(logDir, 'run.log');

for (const level of ['log', 'info', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    appendFileSync(runLog, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${format(...args)}\n`);
  };
}

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------------------------
// Ctrl+C
// -----------------------------------------------------------------------------

let stopRequested = false;
process.on('SIGINT', () => {
  if (stopRequested) {
    console.error('Segundo Ctrl+C: saliendo ya.');
    process.exit(130);
  }
  stopRequested = true;
  console.warn('Ctrl+C: termina el target en curso y se detiene. Otra vez para salir ya.');
});

// -----------------------------------------------------------------------------
// Barrido
// -----------------------------------------------------------------------------

async function loadTargets(): Promise<Array<{ target: ScrapeTargetRow; store: StoreRow }>> {
  const db = getSupabaseAdmin();
  const [targetsResult, storesResult] = await Promise.all([
    db.from('scrape_targets').select('*'),
    db.from('stores').select('*'),
  ]);
  if (targetsResult.error) throw new Error(targetsResult.error.message);
  if (storesResult.error) throw new Error(storesResult.error.message);

  const storesById = new Map((storesResult.data as StoreRow[]).map((store) => [store.id, store]));
  const now = Date.now();

  return (targetsResult.data as ScrapeTargetRow[])
    .map((target) => ({ target, store: storesById.get(target.store_id)! }))
    .filter(({ target, store }) => {
      if (!store) return false;
      if (!includePaused && (!target.is_active || !store.is_active)) return false;
      if (stores.length > 0 && !stores.includes(store.slug.toLowerCase())) return false;
      if (match && !target.name.toLowerCase().includes(match)) return false;
      if (onlyDue && new Date(target.next_run_at).getTime() > now) return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.store.slug.localeCompare(b.store.slug) || a.target.name.localeCompare(b.target.name),
    );
}

async function main(): Promise<number> {
  console.info(`Traza en ${logDir}`);

  const queue = await loadTargets();
  console.info(`${queue.length} targets en cola`);
  queue.forEach(({ target, store }, i) =>
    console.info(`  ${String(i + 1).padStart(3)}. [${store.slug}] ${target.name}`),
  );
  if (dry || queue.length === 0) return 0;

  // Libera los locks de corridas muertas (por ejemplo un Ctrl+C doble anterior).
  await recoverStaleRuns();

  const results: RunResult[] = [];
  let pendingPublish: RunResult[] = [];
  const startedAll = Date.now();

  for (const [i, { target, store }] of queue.entries()) {
    if (stopRequested) break;

    const position = `${i + 1}/${queue.length}`;
    console.info(`\n=== ${position} [${store.slug}] ${target.name} ===`);

    const strategyLog: Array<Record<string, unknown>> = [];
    let result: RunResult;
    try {
      result = await runTarget({
        target,
        store,
        trigger: 'backfill',
        timeBudgetMs: TARGET_BUDGET_MS,
        onLog: (entry) => {
          strategyLog.push(entry);
          const level = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'info';
          console[level](`    ${entry.message}`);
        },
      });
    } catch (error) {
      // Error antes de abrir la corrida (estrategia inexistente, etc.).
      const message = error instanceof Error ? error.message : String(error);
      console.error(`    ${message}`);
      result = {
        targetId: target.id,
        targetName: target.name,
        storeSlug: store.slug,
        runId: null,
        status: 'failed',
        durationMs: 0,
        itemsFound: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        itemsUnchanged: 0,
        itemsDelisted: 0,
        priceChanges: 0,
        pagesFetched: 0,
        errorMessage: message,
        warnings: [],
      };
    }

    results.push(result);
    pendingPublish.push(result);

    console.info(
      `--> ${result.status} en ${(result.durationMs / 1000).toFixed(1)} s · ${result.itemsFound} art · ` +
        `${result.itemsNew} nuevos · ${result.priceChanges} precios · ${result.pagesFetched} paginas` +
        (result.errorMessage ? ` · ${result.errorMessage}` : ''),
    );

    const runRow = result.runId
      ? (await getSupabaseAdmin().from('scrape_runs').select('*').eq('id', result.runId).single()).data
      : null;
    writeFileSync(
      join(logDir, `${String(i + 1).padStart(3, '0')}-${store.slug}-${slugify(target.name)}.json`),
      JSON.stringify({ target: { id: target.id, name: target.name, store: store.slug }, result, strategyLog, runRow }, null, 2),
    );

    if (pendingPublish.length >= PUBLISH_EVERY) {
      console.info('Refrescando catalogo publico...');
      await publishCatalog(pendingPublish, 'backfill');
      pendingPublish = [];
    }

    if (i < queue.length - 1 && !stopRequested) await sleep(pauseMs);
  }

  if (pendingPublish.length > 0) {
    console.info('Refrescando catalogo publico...');
    await publishCatalog(pendingPublish, 'backfill');
  }

  // Resumen
  const byStatus = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const minutes = ((Date.now() - startedAll) / 60_000).toFixed(1);
  const cell = (text: string) => text.replace(/\|/g, '/').replace(/\s+/g, ' ');

  writeFileSync(
    join(logDir, 'summary.md'),
    [
      `# Barrido local ${stamp}`,
      '',
      `${results.length} de ${queue.length} targets en ${minutes} min · ` +
        Object.entries(byStatus).map(([status, n]) => `${status}: ${n}`).join(' · ') +
        (stopRequested ? ' · **detenido con Ctrl+C**' : ''),
      '',
      '| # | Tienda | Target | Estado | Duración | Artículos | Nuevos | Precios | Error |',
      '|---|---|---|---|---|---|---|---|---|',
      ...results.map(
        (r, i) =>
          `| ${i + 1} | ${r.storeSlug} | ${cell(r.targetName)} | ${r.status} | ${(r.durationMs / 1000).toFixed(1)} s | ` +
          `${r.itemsFound} | ${r.itemsNew} | ${r.priceChanges} | ${cell(r.errorMessage ?? '')} |`,
      ),
      '',
    ].join('\n'),
  );

  console.info(`\nListo en ${minutes} min: ${JSON.stringify(byStatus)}`);
  console.info(`Resumen: ${join(logDir, 'summary.md')}`);
  return results.some((r) => r.status === 'failed') ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
