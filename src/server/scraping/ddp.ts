/**
 * Cliente DDP minimo (el protocolo de Meteor sobre WebSocket).
 *
 * Existe porque Kielsa no publica su catalogo por http: es un Meteor cuyo
 * html es un cascaron y cuyos datos viajan por `wss://.../websocket` como
 * mensajes `sub` / `added` / `ready`. No hay endpoint JSON equivalente (el
 * "buscador" solo devuelve ids). Es la unica pieza del scraper que no pasa
 * por `http.ts`: la cortesia entre suscripciones la pone quien lo usa.
 *
 * Cubre lo justo: conectar, suscribirse a una publicacion, juntar los
 * documentos `added` hasta `ready`, desuscribirse. Sin metodos, sin login,
 * sin reconexion: si el socket se cae, la corrida falla y el runner reintenta
 * en la siguiente.
 *
 * Usa el `WebSocket` global de Node 22+; no agrega dependencias.
 */

export interface DdpDoc {
  id: string;
  collection: string;
  fields: Record<string, unknown>;
}

export interface DdpSubscribeOptions {
  /** Tiempo maximo esperando `ready`; una publicacion grande tarda ~35 s por 6 800 docs. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface DdpMessage {
  msg?: string;
  id?: string;
  subs?: string[];
  collection?: string;
  fields?: Record<string, unknown>;
  error?: unknown;
  reason?: string;
}

export class DdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly waiters = new Map<string, { docs: DdpDoc[]; resolve: (docs: DdpDoc[]) => void; reject: (error: Error) => void }>();

  constructor(private readonly url: string) {}

  async connect(timeoutMs = 15_000): Promise<void> {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`DDP: sin respuesta de ${this.url} en ${timeoutMs} ms`)), timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] }));
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`DDP: no se pudo abrir ${this.url}`));
      };
      ws.onmessage = (event) => {
        const message = this.parse(event.data);
        if (message?.msg === 'connected') {
          clearTimeout(timer);
          ws.onmessage = (next) => this.dispatch(this.parse(next.data));
          ws.onerror = () => this.fail(new Error('DDP: error de socket'));
          ws.onclose = () => this.fail(new Error('DDP: el servidor cerro la conexion'));
          resolve();
        } else if (message?.msg === 'failed') {
          clearTimeout(timer);
          reject(new Error('DDP: el servidor rechazo la version del protocolo'));
        }
      };
    });
  }

  /**
   * Se suscribe, junta todo lo `added` hasta `ready` y se desuscribe.
   * Devuelve los documentos tal cual llegaron.
   */
  async subscribe(name: string, params: unknown[], options: DdpSubscribeOptions = {}): Promise<DdpDoc[]> {
    const ws = this.ws;
    if (!ws) throw new Error('DDP: no conectado');
    const id = String(this.nextId++);
    const timeoutMs = options.timeoutMs ?? 120_000;

    return new Promise<DdpDoc[]>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`DDP: "${name}" no llego a ready en ${timeoutMs} ms`)), timeoutMs);
      const onAbort = () => finish(new Error('DDP: corrida abortada'));
      options.signal?.addEventListener('abort', onAbort, { once: true });

      const finish = (error: Error | null, docs: DdpDoc[] = []) => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        this.waiters.delete(id);
        // Desuscribirse hace que el servidor mande `removed` por cada doc:
        // se ignoran (no hay waiter) y la siguiente suscripcion parte limpia.
        try {
          ws.send(JSON.stringify({ msg: 'unsub', id }));
        } catch {
          // Socket ya cerrado: nada que limpiar.
        }
        if (error) reject(error);
        else resolve(docs);
      };

      this.waiters.set(id, { docs: [], resolve: (docs) => finish(null, docs), reject: (error) => finish(error) });
      ws.send(JSON.stringify({ msg: 'sub', id, name, params }));
    });
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      // Ya cerrado.
    }
    this.ws = null;
  }

  private parse(data: unknown): DdpMessage | null {
    if (typeof data !== 'string') return null;
    try {
      return JSON.parse(data) as DdpMessage;
    } catch {
      return null;
    }
  }

  private dispatch(message: DdpMessage | null): void {
    if (!message) return;
    switch (message.msg) {
      case 'ping':
        this.ws?.send(JSON.stringify({ msg: 'pong', id: message.id }));
        return;
      case 'added': {
        // Un `added` no dice a que suscripcion pertenece: se atribuye a la
        // unica activa. Este cliente solo suscribe de a una por eso mismo.
        const waiter = this.waiters.values().next().value;
        if (waiter && message.collection && message.id && message.fields) {
          waiter.docs.push({ id: message.id, collection: message.collection, fields: message.fields });
        }
        return;
      }
      case 'ready':
        for (const subId of message.subs ?? []) this.waiters.get(subId)?.resolve(this.waiters.get(subId)!.docs);
        return;
      case 'nosub': {
        const waiter = message.id ? this.waiters.get(message.id) : undefined;
        waiter?.reject(new Error(`DDP: nosub ${JSON.stringify(message.error ?? null)}`));
        return;
      }
      default:
        return;
    }
  }

  private fail(error: Error): void {
    for (const waiter of this.waiters.values()) waiter.reject(error);
  }
}
