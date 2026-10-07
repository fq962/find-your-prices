/**
 * Corre las tandas de scraping fuera del sitio, directo contra Supabase.
 *
 * Existe porque el sitio corre en Cloudflare Workers (plan Free): 50
 * subrequests por invocacion, y cada pagina de una tienda y cada llamada a
 * Supabase cuentan. Un solo catalogo grande ya no cabe. Aca no hay techo: es
 * Node normal en el runner de GitHub Actions (.github/workflows/scrape-cron.yml).
 *
 *   npx tsx --conditions=react-server scripts/run-scrape.ts
 *
 * `--conditions=react-server` hace que `import 'server-only'` resuelva al
 * modulo vacio, como dentro de Next.
 *
 * Variables:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY   (obligatorias)
 *   SCRAPE_LIMIT        targets por tanda (default 2)
 *   SCRAPE_UNTIL_EMPTY  "true" repite tandas hasta que no queden vencidos
 *   SCRAPE_MAX_ROUNDS   tope de tandas con UNTIL_EMPTY (default 60)
 *   GITHUB_STEP_SUMMARY si existe, ahi se escribe la tabla de resultados
 *
 * Sale con codigo 1 si algun target fallo, para que el job quede en rojo.
 */
import { appendFileSync } from 'node:fs';
import { runDueTargets, type RunResult } from '@/server/scraping/runner';

// Por target: holgado, aca nadie corta la conexion. El job tiene su propio
// timeout en el workflow.
const BATCH_BUDGET_MS = 20 * 60_000;

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const limit = envNumber('SCRAPE_LIMIT', 2);
const untilEmpty = process.env.SCRAPE_UNTIL_EMPTY === 'true';
const maxRounds = untilEmpty ? envNumber('SCRAPE_MAX_ROUNDS', 60) : 1;

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const summary = (line: string) => {
  if (summaryPath) appendFileSync(summaryPath, `${line}\n`);
};

const cell = (value: string) => value.replace(/\|/g, '/').replace(/\s+/g, ' ');

function report(run: RunResult) {
  const seconds = (run.durationMs / 1000).toFixed(1);
  console.log(
    `${run.status.padEnd(8)} ${seconds.padStart(7)} s  ${String(run.itemsFound).padStart(6)} art  ` +
      `${String(run.priceChanges).padStart(5)} precios  ${run.targetName}` +
      (run.errorMessage ? `  -- ${run.errorMessage}` : ''),
  );
  summary(
    `| ${cell(run.targetName)} | ${run.status} | ${seconds} s | ${run.itemsFound} | ${run.priceChanges} | ${cell(run.errorMessage ?? '')} |`,
  );
  if (run.status === 'failed' && process.env.GITHUB_ACTIONS) {
    console.log(`::warning::${run.targetName}: ${run.errorMessage ?? 'fallo'}`);
  }
}

async function main(): Promise<number> {
  summary('| Target | Estado | Duración | Artículos | Precios | Error |');
  summary('|---|---|---|---|---|---|');

  let failed = 0;
  let total = 0;
  let remaining = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const batch = await runDueTargets({ limit, timeBudgetMs: BATCH_BUDGET_MS, trigger: 'cron' });
    batch.processed.forEach(report);

    total += batch.processed.length;
    failed += batch.processed.filter((run) => run.status === 'failed').length;
    remaining = batch.remaining;
    console.log(`-- tanda ${round}: ${batch.processed.length} targets; quedan mas vencidos: ${remaining > 0 ? 'si' : 'no'}`);

    if (remaining === 0 || batch.processed.length === 0) break;
  }

  if (total === 0) summary('| _Nada vencido_ | | | | | |');
  summary('');
  summary(`Quedan más vencidos: ${remaining > 0 ? 'sí' : 'no'}`);

  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
