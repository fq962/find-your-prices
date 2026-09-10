/**
 * Matematica de la agenda del scraper.
 *
 * Vive en `lib/` y no en `server/scraping/` a proposito: el runner la usa para
 * reprogramar y el panel (componente de cliente) la usa para mostrar en
 * palabras lo que el operador acaba de elegir. Si estuviera en `server/`, el
 * panel tendria que reimplementarla, y dos implementaciones de la misma regla
 * es como se llega a que la pantalla diga una cosa y la base haga otra.
 *
 * ---------------------------------------------------------------------------
 * El modelo: ancla + intervalo
 * ---------------------------------------------------------------------------
 * Un horario son dos datos: donde empieza la rejilla (`schedule_anchor_at`) y
 * cada cuanto se repite (`frequency_minutes`). Todo momento valido cumple
 *
 *     next_run_at = ancla + k * intervalo        (k entero >= 0)
 *
 * "Todos los lunes a las 08:00" es ancla = un lunes a las 08:00, intervalo =
 * 10 080 min (7 dias). "Cada 3 dias a las 03:00" es ancla = cualquier dia a las
 * 03:00, intervalo = 4320 min. Las dos son el mismo mecanismo.
 *
 * Lo que este modelo compra sobre `now() + intervalo` es que la duracion de la
 * corrida deja de correr el horario hacia adelante. Y lo que compra sobre una
 * expresion cron es "cada 3 dias": un paso `/3` en el campo de dia de mes
 * reinicia el conteo cada mes y salta de 1 a 3 dias entre el 31 y el 1.
 */

/**
 * Zona horaria de la operacion. Honduras no aplica horario de verano desde
 * 2006: es UTC-6 todo el año. Aun asi el offset se calcula con `Intl` en vez de
 * escribir -360 a mano, para que el dia que eso cambie (o que el proyecto sirva
 * a otro pais) siga dando la hora correcta.
 */
export const SCHEDULE_TIME_ZONE = 'America/Tegucigalpa';

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 10_080;

const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

/** Con tilde, para texto que ve el usuario. */
const WEEKDAYS_DISPLAY = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

// -----------------------------------------------------------------------------
// Zona horaria
// -----------------------------------------------------------------------------

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHEDULE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Descompone un instante en la hora de pared de Tegucigalpa. */
export function zonedParts(date: Date): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

/** Minutos que la zona va por delante de UTC en ese instante (-360 en Honduras). */
function zoneOffsetMinutes(date: Date): number {
  const p = zonedParts(date);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // El instante original se trunca al segundo: formatToParts no da milisegundos
  // y si no se truncan, el offset sale con decimales.
  return (asIfUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Convierte una hora de pared de Tegucigalpa en un instante.
 *
 * Se resuelve en dos pasos porque el offset depende del instante que estamos
 * buscando: se estima con el offset provisional y se corrige. Con offset fijo
 * (el caso de Honduras) la segunda pasada no cambia nada; con horario de verano
 * cae en el lado correcto del salto.
 */
export function wallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass += 1) {
    instant = new Date(naive - zoneOffsetMinutes(instant) * 60_000);
  }
  return instant;
}

/**
 * Texto `YYYY-MM-DDTHH:mm` para un `<input type="datetime-local">`, en hora de
 * Tegucigalpa. El input no lleva zona, asi que sin esto el navegador mostraria
 * la hora local de quien abre el panel: el mismo target diria "08:00" en
 * Honduras y "15:00" para alguien en Madrid.
 */
export function toLocalInputValue(iso: string | Date): string {
  const p = zonedParts(typeof iso === 'string' ? new Date(iso) : iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** El camino inverso: lo que escribio el operador, leido como hora de Honduras. */
export function fromLocalInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = wallClockToInstant(Number(y), Number(mo), Number(d), Number(h), Number(mi));
  return Number.isFinite(date.getTime()) ? date : null;
}

// -----------------------------------------------------------------------------
// La rejilla
// -----------------------------------------------------------------------------

/**
 * Primer punto de la rejilla **estrictamente posterior** a `now`.
 *
 * Es lo que el runner escribe en `next_run_at` cuando una corrida termina bien.
 * Nota el "estrictamente": si la corrida ocurrio justo en su horario, la
 * siguiente es un intervalo despues, no la misma.
 *
 * Un ancla en el futuro se respeta tal cual (k = 0): sirve para "programar la
 * primera corrida para el lunes" sin que una ejecucion manual de hoy la mueva.
 */
export function nextRunFromAnchor(
  anchor: Date | string,
  frequencyMinutes: number,
  now: Date = new Date(),
): Date {
  const anchorMs = (typeof anchor === 'string' ? new Date(anchor) : anchor).getTime();
  const periodMs = frequencyMinutes * 60_000;

  // Sin ancla utilizable o sin intervalo valido no hay rejilla que seguir.
  if (!Number.isFinite(anchorMs) || !Number.isFinite(periodMs) || periodMs <= 0) {
    return new Date(now.getTime() + Math.max(frequencyMinutes, 1) * 60_000);
  }

  const delta = now.getTime() - anchorMs;
  if (delta < 0) return new Date(anchorMs);

  const steps = Math.floor(delta / periodMs) + 1;
  return new Date(anchorMs + steps * periodMs);
}

// -----------------------------------------------------------------------------
// Como se lee un horario
// -----------------------------------------------------------------------------

export interface FrequencyParts {
  value: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks';
}

/** Elige la unidad mas grande en la que el intervalo cae exacto. */
export function splitFrequency(minutes: number | null): FrequencyParts {
  if (!minutes || minutes <= 0) return { value: 12, unit: 'hours' };
  if (minutes % MINUTES_PER_WEEK === 0) return { value: minutes / MINUTES_PER_WEEK, unit: 'weeks' };
  if (minutes % MINUTES_PER_DAY === 0) return { value: minutes / MINUTES_PER_DAY, unit: 'days' };
  if (minutes % MINUTES_PER_HOUR === 0) return { value: minutes / MINUTES_PER_HOUR, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}

export function joinFrequency({ value, unit }: FrequencyParts): number {
  const factor =
    unit === 'weeks'
      ? MINUTES_PER_WEEK
      : unit === 'days'
        ? MINUTES_PER_DAY
        : unit === 'hours'
          ? MINUTES_PER_HOUR
          : 1;
  return Math.max(1, Math.round(value * factor));
}

function hhmm(parts: ZonedParts): string {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/**
 * El horario en una frase, en hora de Honduras.
 *
 * Es la unica defensa contra programar algo distinto de lo que se creia: el
 * operador elige "cada 7 días" con ancla el 15 de septiembre y lee "cada lunes
 * a las 08:00". Si dice martes, se equivoco de fecha.
 */
export function describeSchedule(
  anchor: Date | string | null,
  frequencyMinutes: number | null,
): string {
  if (!frequencyMinutes || frequencyMinutes <= 0) return 'manual';

  const anchorDate = anchor ? (typeof anchor === 'string' ? new Date(anchor) : anchor) : null;
  const parts = anchorDate && Number.isFinite(anchorDate.getTime()) ? zonedParts(anchorDate) : null;
  const { value, unit } = splitFrequency(frequencyMinutes);

  // Sin ancla no se puede decir el dia ni la hora, solo cada cuanto. Pasa con
  // targets anteriores a la migracion 0023 y mientras esa migracion no corra:
  // mejor "cada 1 semanas" que mentir con un dia inventado.
  if (unit === 'weeks') {
    if (!parts) return value === 1 ? 'cada semana' : `cada ${value} semanas`;
    const day = WEEKDAYS_DISPLAY[parts.weekday];
    return value === 1
      ? `cada ${day} a las ${hhmm(parts)}`
      : `cada ${value} semanas, ${day} a las ${hhmm(parts)}`;
  }

  if (unit === 'days') {
    if (!parts) return value === 1 ? 'todos los días' : `cada ${value} días`;
    return value === 1
      ? `todos los días a las ${hhmm(parts)}`
      : `cada ${value} días a las ${hhmm(parts)}`;
  }

  if (unit === 'hours') {
    const from = parts ? ` (desde las ${hhmm(parts)})` : '';
    return value === 1 ? `cada hora${from}` : `cada ${value} horas${from}`;
  }

  return `cada ${value} min`;
}

/** Nombre de dia sin tilde, para valores de formulario. */
export function weekdayKey(index: number): string {
  return WEEKDAYS[index] ?? WEEKDAYS[0];
}
