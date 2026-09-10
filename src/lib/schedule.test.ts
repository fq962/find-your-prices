import { describe, expect, test } from 'vitest';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_WEEK,
  describeSchedule,
  fromLocalInputValue,
  joinFrequency,
  nextRunFromAnchor,
  splitFrequency,
  toLocalInputValue,
  zonedParts,
} from './schedule';

/**
 * Honduras es UTC-6 todo el año, asi que las horas de pared de abajo se
 * convierten sumando 6 h para llegar a UTC. Las fechas estan elegidas a
 * proposito: el 15 de septiembre de 2025 fue lunes.
 */
const LUNES_8AM = '2025-09-15T14:00:00.000Z'; // lunes 08:00 en Tegucigalpa

describe('zona horaria', () => {
  test('descompone un instante en hora de Honduras', () => {
    const parts = zonedParts(new Date(LUNES_8AM));
    expect(parts).toMatchObject({ year: 2025, month: 9, day: 15, hour: 8, minute: 0, weekday: 1 });
  });

  test('el input datetime-local va y vuelve sin perder la hora', () => {
    expect(toLocalInputValue(LUNES_8AM)).toBe('2025-09-15T08:00');
    expect(fromLocalInputValue('2025-09-15T08:00')?.toISOString()).toBe(LUNES_8AM);
  });

  test('lee la hora escrita como hora de Honduras, no del navegador', () => {
    // 03:00 en Tegucigalpa son las 09:00 UTC.
    expect(fromLocalInputValue('2025-09-16T03:00')?.toISOString()).toBe('2025-09-16T09:00:00.000Z');
    expect(fromLocalInputValue('no es una fecha')).toBeNull();
  });
});

describe('nextRunFromAnchor', () => {
  const semanal = MINUTES_PER_WEEK;

  test('una corrida puntual salta un intervalo exacto', () => {
    const next = nextRunFromAnchor(LUNES_8AM, semanal, new Date(LUNES_8AM));
    expect(next.toISOString()).toBe('2025-09-22T14:00:00.000Z'); // el lunes siguiente, 08:00
  });

  /**
   * La razon de ser de todo esto: antes, una corrida que empezaba tarde y
   * duraba minutos empujaba la siguiente, y la agenda se deslizaba sola.
   */
  test('la duracion de la corrida no corre el horario', () => {
    // Empezo 4 s tarde y tardo 90 s.
    const terminoTarde = new Date(Date.parse(LUNES_8AM) + 4_000 + 90_000);
    const next = nextRunFromAnchor(LUNES_8AM, semanal, terminoTarde);
    expect(toLocalInputValue(next)).toBe('2025-09-22T08:00');
  });

  test('un target atrasado varias semanas vuelve a la rejilla, no la repite', () => {
    // Estuvo caido casi tres semanas; ahora es jueves.
    const ahora = new Date('2025-10-02T18:30:00.000Z');
    const next = nextRunFromAnchor(LUNES_8AM, semanal, ahora);
    // El proximo lunes a las 08:00, no cuatro corridas atrasadas.
    expect(toLocalInputValue(next)).toBe('2025-10-06T08:00');
  });

  test('un ancla en el futuro se respeta: la primera corrida no se adelanta', () => {
    const ahora = new Date('2025-09-10T12:00:00.000Z');
    expect(nextRunFromAnchor(LUNES_8AM, semanal, ahora).toISOString()).toBe(LUNES_8AM);
  });

  test('cada 3 dias mantiene la hora, sin el salto de fin de mes del cron', () => {
    const ancla = fromLocalInputValue('2025-10-28T03:00')!;
    let cursor = ancla;
    const horas: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      cursor = nextRunFromAnchor(ancla, 3 * MINUTES_PER_DAY, cursor);
      horas.push(toLocalInputValue(cursor));
    }
    // Cruza el cambio de mes sin acortar el intervalo.
    expect(horas).toEqual(['2025-10-31T03:00', '2025-11-03T03:00', '2025-11-06T03:00']);
  });

  test('sin ancla utilizable cae al comportamiento viejo', () => {
    const ahora = new Date(LUNES_8AM);
    const next = nextRunFromAnchor('no es fecha', 60, ahora);
    expect(next.getTime()).toBe(ahora.getTime() + 3_600_000);
  });
});

describe('lectura del intervalo', () => {
  test('elige la unidad mas grande que da exacto', () => {
    expect(splitFrequency(MINUTES_PER_WEEK)).toEqual({ value: 1, unit: 'weeks' });
    expect(splitFrequency(3 * MINUTES_PER_DAY)).toEqual({ value: 3, unit: 'days' });
    expect(splitFrequency(360)).toEqual({ value: 6, unit: 'hours' });
    expect(splitFrequency(45)).toEqual({ value: 45, unit: 'minutes' });
    expect(splitFrequency(null)).toEqual({ value: 12, unit: 'hours' });
  });

  test('ida y vuelta', () => {
    for (const minutes of [1, 45, 360, 1440, 4320, 10_080, 20_160]) {
      expect(joinFrequency(splitFrequency(minutes))).toBe(minutes);
    }
  });

  test('describe el horario en palabras', () => {
    expect(describeSchedule(LUNES_8AM, MINUTES_PER_WEEK)).toBe('cada lunes a las 08:00');
    expect(describeSchedule(LUNES_8AM, 2 * MINUTES_PER_WEEK)).toBe(
      'cada 2 semanas, lunes a las 08:00',
    );
    expect(describeSchedule(LUNES_8AM, MINUTES_PER_DAY)).toBe('todos los días a las 08:00');
    expect(describeSchedule(LUNES_8AM, 3 * MINUTES_PER_DAY)).toBe('cada 3 días a las 08:00');
    expect(describeSchedule(LUNES_8AM, 360)).toBe('cada 6 horas (desde las 08:00)');
    expect(describeSchedule(null, 0)).toBe('manual');
  });

  /** Sin ancla se dice solo el intervalo: inventar un día sería peor que callarlo. */
  test('degrada sin ancla en vez de inventar un día', () => {
    expect(describeSchedule(null, MINUTES_PER_WEEK)).toBe('cada semana');
    expect(describeSchedule(null, 3 * MINUTES_PER_DAY)).toBe('cada 3 días');
    expect(describeSchedule(null, MINUTES_PER_DAY)).toBe('todos los días');
    expect(describeSchedule(null, 360)).toBe('cada 6 horas');
  });
});
