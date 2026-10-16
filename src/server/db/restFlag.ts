/**
 * Bandera del respaldo por la API HTTPS de Supabase (`restFallback.ts`).
 *
 * Vive aparte para que los servicios la consulten sin cargar `supabase-js`:
 * el módulo del respaldo se importa solo cuando está encendida, que pasa
 * únicamente en scripts corridos desde una red sin acceso a Postgres.
 */

const FLAG = 'DB_VIA_SUPABASE_REST';

/** Activa el respaldo para el resto del proceso. Solo para scripts. */
export function enableRestFallback(): void {
  process.env[FLAG] = '1';
}

export function restFallbackEnabled(): boolean {
  return process.env[FLAG] === '1';
}
