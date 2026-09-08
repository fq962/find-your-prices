import type { HttpClient, HttpRequestOptions } from './types';

/**
 * Cliente http compartido por todas las estrategias.
 *
 * Centraliza lo que ninguna estrategia deberia reimplementar: reintentos con
 * backoff, timeout por request, pausa de cortesia entre llamadas, user agent
 * identificable y telemetria de red para la bitacora.
 */

export const DEFAULT_USER_AGENT =
  'FindYourPricesBot/1.0 (+https://findyourprices.hn/bot; comparador de precios de Honduras)';

export interface HttpClientOptions {
  userAgent?: string | null;
  /** Pausa entre requests, para no golpear el sitio de origen. */
  delayMs?: number;
  timeoutMs?: number;
  retries?: number;
  baseHeaders?: Record<string, string>;
  signal?: AbortSignal;
}

/** Errores http que vale la pena reintentar: cortes de red y saturacion. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly bodyPreview?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const {
    userAgent = DEFAULT_USER_AGENT,
    delayMs = 300,
    timeoutMs = 30_000,
    retries = 3,
    baseHeaders = {},
    signal,
  } = options;

  const stats = { requests: 0, errors: 0, bytes: 0 };
  // Serializa las llamadas para que la pausa de cortesia se respete de verdad
  // aunque la estrategia dispare varias en paralelo.
  let nextSlot: Promise<unknown> = Promise.resolve();

  async function request(url: string, opts: HttpRequestOptions = {}): Promise<Response> {
    const method = opts.method ?? 'GET';
    const maxAttempts = (opts.retries ?? retries) + 1;
    const perRequestTimeout = opts.timeoutMs ?? timeoutMs;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (signal?.aborted) throw new Error('Scraping abortado antes de completar la peticion');

      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), perRequestTimeout);
      const onOuterAbort = () => timeoutController.abort();
      signal?.addEventListener('abort', onOuterAbort, { once: true });

      try {
        stats.requests += 1;
        const response = await fetch(url, {
          method,
          headers: {
            'User-Agent': userAgent ?? DEFAULT_USER_AGENT,
            Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
            'Accept-Language': 'es-HN,es;q=0.9',
            ...baseHeaders,
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...opts.headers,
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: timeoutController.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          stats.errors += 1;
          const preview = await response.text().then((t) => t.slice(0, 300)).catch(() => '');

          if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
            // 429 suele traer Retry-After; se respeta si viene.
            const retryAfter = Number(response.headers.get('retry-after'));
            const wait = Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : 2 ** attempt * 500;
            await sleep(wait);
            continue;
          }

          throw new HttpError(
            `${method} ${url} respondio ${response.status}`,
            response.status,
            url,
            preview,
          );
        }

        return response;
      } catch (error) {
        lastError = error;
        if (error instanceof HttpError) throw error;
        if (signal?.aborted) throw error;
        stats.errors += 1;
        if (attempt >= maxAttempts) break;
        await sleep(2 ** attempt * 500);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onOuterAbort);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Fallo la peticion a ${url} tras ${maxAttempts} intentos`);
  }

  /** Encola la peticion respetando la pausa de cortesia entre llamadas. */
  function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const result = nextSlot.then(fn);
    nextSlot = result.then(
      () => sleep(delayMs),
      () => sleep(delayMs),
    );
    return result;
  }

  async function readText(response: Response): Promise<string> {
    const text = await response.text();
    stats.bytes += Buffer.byteLength(text, 'utf8');
    return text;
  }

  return {
    stats,

    getJson<T>(url: string, opts?: HttpRequestOptions): Promise<T> {
      return schedule(async () => {
        const response = await request(url, { ...opts, method: 'GET' });
        return JSON.parse(await readText(response)) as T;
      });
    },

    postJson<T>(url: string, body: unknown, opts?: HttpRequestOptions): Promise<T> {
      return schedule(async () => {
        const response = await request(url, { ...opts, method: 'POST', body });
        return JSON.parse(await readText(response)) as T;
      });
    },

    getText(url: string, opts?: HttpRequestOptions): Promise<string> {
      return schedule(async () => {
        const response = await request(url, { ...opts, method: 'GET' });
        return readText(response);
      });
    },
  };
}
