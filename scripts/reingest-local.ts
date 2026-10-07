/**
 * Repite la ingesta de descargas guardadas, SIN volver a scrapear. Solo local.
 *
 * Las descargas las guarda scripts/scrape-all-local.ts en scrape-data/ antes de
 * escribir en la base. Si la ingesta fallo (timeout de Supabase, red, etc.),
 * esto la repite con el mismo pipeline del runner: abre una corrida 'backfill'
 * en la bitacora, sincroniza categorias, ingiere, marca bajas y reprograma el
 * target.
 *
 *   npm run reingest:local -- scrape-data/acosa/2026-10-07T14-18-02-acosa-catalogo-completo.json
 *   npm run reingest:local -- scrape-data/acosa            (todos los de la carpeta)
 *   npm run reingest:local -- scrape-data                  (todo)
 *
 * Reingerir el mismo snapshot dos veces es inofensivo: lo que no cambio se
 * cuenta como "sin cambios" y no genera precios nuevos.
 *
 * Ojo con snapshots viejos de un catalogo completo: al reingerirlos se marcan
 * como baja los productos que no aparezcan en el, aunque hoy existan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getSupabaseAdmin } from '@/server/db/supabase';
import {
  publishCatalog,
  recoverStaleRuns,
  runTarget,
  type RunResult,
  type ScrapeSnapshot,
} from '@/server/scraping/runner';
import type { ScrapeTargetRow, StoreRow } from '@/server/scraping/types';

function collectFiles(path: string): string[] {
  if (statSync(path).isDirectory()) {
    return readdirSync(path)
      .sort()
      .flatMap((entry) => collectFiles(join(path, entry)));
  }
  return path.endsWith('.json') ? [path] : [];
}

async function main(): Promise<number> {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error('Uso: npm run reingest:local -- <archivo.json | carpeta> [...]');
    return 1;
  }

  const files = inputs.flatMap(collectFiles);
  console.info(`${files.length} snapshots`);
  await recoverStaleRuns();

  const db = getSupabaseAdmin();
  const results: RunResult[] = [];

  for (const [i, file] of files.entries()) {
    const name = relative(process.cwd(), file);
    console.info(`\n=== ${i + 1}/${files.length} ${name} ===`);

    const snapshot = JSON.parse(readFileSync(file, 'utf8')) as ScrapeSnapshot;
    if (snapshot.version !== 1 || !snapshot.targetId || !snapshot.result?.products) {
      console.error('    No es un snapshot valido; se salta');
      continue;
    }

    const { data: target, error } = await db
      .from('scrape_targets')
      .select('*')
      .eq('id', snapshot.targetId)
      .single();
    if (error || !target) {
      console.error(`    El target ${snapshot.targetId} ya no existe; se salta`);
      continue;
    }
    const { data: store } = await db.from('stores').select('*').eq('id', target.store_id).single();

    console.info(
      `    ${snapshot.targetName}: ${snapshot.result.products.length} productos descargados el ${snapshot.scrapedAt}`,
    );

    const result = await runTarget({
      target: target as ScrapeTargetRow,
      store: store as StoreRow,
      trigger: 'backfill',
      replay: snapshot,
      onLog: (entry) => {
        if (entry.level !== 'info') console.warn(`    ${entry.message}`);
      },
    });
    results.push(result);

    console.info(
      `--> ${result.status} · ${result.itemsFound} art · ${result.itemsNew} nuevos · ` +
        `${result.itemsUpdated} actualizados · ${result.priceChanges} precios · ${result.itemsDelisted} bajas` +
        (result.errorMessage ? ` · ${result.errorMessage}` : ''),
    );
  }

  if (results.length > 0) {
    console.info('\nRefrescando catalogo publico...');
    await publishCatalog(results, 'backfill');
  }

  const failed = results.filter((r) => r.status === 'failed').length;
  console.info(`\nListo: ${results.length - failed} bien, ${failed} fallidos`);
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
