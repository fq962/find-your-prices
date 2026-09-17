'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

interface ImageUploaderProps {
  /** Id de la fila (categoría o tienda) que recibe la imagen. */
  entityId: string;
  /** La server action que recibe `id` e `image` (ver actions.ts de cada panel). */
  action: (formData: FormData) => Promise<void>;
  buttonClass: string;
  /**
   * Bajo qué nombre se recuerdan los ajustes en este navegador
   * (`localStorage`): "categorias", "tiendas". Cada panel guarda los suyos,
   * así 128 para categorías no cambia el 512 de tiendas.
   */
  storageKey: string;
  /** Ancho inicial cuando este navegador no recuerda nada todavía. */
  defaultWidth?: number;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/svg+xml';
const MAX_BYTES = 5 * 1024 * 1024;

/** Anchos ofrecidos de un clic. Cualquier otro se escribe a mano. */
export const OPTIMIZE_PRESETS = [128, 256, 512, 1024] as const;
const MIN_WIDTH = 16;
const MAX_WIDTH = 4096;
const WEBP_QUALITY = 0.85;

/**
 * Reduce a `width` de ancho y convierte a WebP con el canvas del navegador.
 * Se hace acá y no en el servidor a propósito: la foto se sube una vez, y
 * cargar una librería de imágenes en el servidor solo para eso sería pagar
 * en cada despliegue lo que el navegador hace gratis. Conserva la
 * transparencia (WebP la soporta). Si la imagen ya es más angosta no se
 * agranda; solo cambia el formato.
 *
 * Devuelve el archivo original si el navegador no puede codificar WebP.
 */
async function optimizeImage(file: File, width: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, width / bitmap.width);
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    if (!blob || blob.type !== 'image/webp') return file;

    const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'imagen';
    return new File([blob], `${base}.webp`, { type: 'image/webp' });
  } finally {
    bitmap.close();
  }
}

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return OPTIMIZE_PRESETS[1];
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

/**
 * Subida de una imagen por tres caminos: elegir archivo, pegar desde el
 * portapapeles (Ctrl+V / Cmd+V en cualquier parte de la página) o arrastrar
 * y soltar sobre la zona. Con «Optimizar» marcado (el default), la imagen se
 * reduce al ancho elegido —128, 256, 512, 1024 o el que se escriba— y se
 * convierte a WebP en el navegador antes de subir.
 *
 * Es el mismo componente para categorías y tiendas: la server action que
 * recibe `id` e `image` es lo único que cambia entre un panel y otro.
 *
 * Pegar es el que importa: la foto normalmente viene de una captura o de
 * copiar una imagen del sitio de la tienda, y bajarla a disco para volverla
 * a elegir era el paso que sobraba. Lo pegado se convierte en un `File` y se
 * mete en el mismo `<input type=file>` del formulario, así la server action
 * no cambia: recibe exactamente lo mismo que si se hubiera elegido a mano.
 *
 * El listener de `paste` es del documento y no de la zona porque nadie va a
 * hacer clic en un recuadro antes de pegar; se ignora si el foco está en un
 * campo de texto (ahí pegar significa pegar texto).
 */
interface UploaderSettings {
  optimize: boolean;
  width: number;
}

function storageKeyFor(key: string): string {
  return `fyp-image-uploader:${key}`;
}

/** Los últimos ajustes usados en este navegador, o `null`. Nunca lanza. */
function readStoredSettings(key: string): UploaderSettings | null {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UploaderSettings>;
    return {
      optimize: parsed.optimize !== false,
      width: clampWidth(Number(parsed.width)),
    };
  } catch {
    return null;
  }
}

function writeStoredSettings(key: string, settings: UploaderSettings): void {
  try {
    window.localStorage.setItem(storageKeyFor(key), JSON.stringify(settings));
  } catch {
    // Sin almacenamiento (modo privado, cuota): se sigue sin recordar.
  }
}

export function ImageUploader({
  entityId,
  action,
  buttonClass,
  storageKey,
  defaultWidth = 256,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; size: number; originalSize?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [optimize, setOptimize] = useState(true);
  const [width, setWidth] = useState(clampWidth(defaultWidth));
  // Lo que hay escrito en el campo, que puede estar a medias ("10" camino a
  // "1024"): se aplica al salir del campo o al elegir una pastilla.
  const [widthDraft, setWidthDraft] = useState(String(clampWidth(defaultWidth)));
  // El listener de paste se registra una sola vez: lee los ajustes por ref
  // para no quedarse con el valor del primer render.
  const settingsRef = useRef<UploaderSettings>({ optimize: true, width: clampWidth(defaultWidth) });
  const [busy, setBusy] = useState(false);
  // Se guarda lo último aceptado para rehacerlo si cambian los ajustes.
  const originalRef = useRef<File | null>(null);

  // La URL de vista previa se libera al reemplazarla o al desmontar.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function accept(file: File, settings = settingsRef.current): Promise<void> {
    if (!file.type.startsWith('image/')) {
      setError('Eso no es una imagen.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el tope es 5 MB.`);
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    originalRef.current = file;

    // Un portapapeles entrega el archivo como "image.png": se le pone un
    // nombre con fecha para que se distinga en el bucket.
    const extension = file.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png';
    const named = file.name && file.name !== 'image.png' ? file : new File([file], `pegada-${Date.now()}.${extension}`, { type: file.type });

    setError(null);
    setBusy(true);
    let final = named;
    try {
      // Un SVG ya es chico y escala solo: convertirlo a WebP lo empeoraría.
      if (settings.optimize && named.type !== 'image/svg+xml') final = await optimizeImage(named, settings.width);
    } catch {
      setError('No se pudo optimizar; se sube la imagen original.');
    } finally {
      setBusy(false);
    }

    const transfer = new DataTransfer();
    transfer.items.add(final);
    input.files = transfer.files;

    setPreview({
      url: URL.createObjectURL(final),
      name: final.name,
      size: final.size,
      originalSize: final !== named ? named.size : undefined,
    });
  }

  /** Pone los ajustes en el estado y en la ref, sin tocar la imagen. */
  function setSettings(settings: UploaderSettings): void {
    settingsRef.current = settings;
    setOptimize(settings.optimize);
    setWidth(settings.width);
    setWidthDraft(String(settings.width));
  }

  // Los ajustes recordados se leen después de montar, no en el estado
  // inicial: el servidor no tiene localStorage y el HTML tiene que
  // coincidir con el primer render del navegador. Un frame de por medio en
  // vez de setState síncrono en el efecto, como en el panel de scraping.
  useEffect(() => {
    const stored = readStoredSettings(storageKey);
    if (!stored) return;
    const frame = requestAnimationFrame(() => setSettings(stored));
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  /**
   * Cambia un ajuste, lo recuerda para la próxima vez en este navegador y,
   * con una imagen ya elegida, la rehace al instante. Recordar es el punto:
   * quien usa 128 para categorías no tiene que volver a elegirlo en cada una.
   */
  function applySettings(next: Partial<UploaderSettings>): void {
    const settings = { ...settingsRef.current, ...next };
    setSettings(settings);
    writeStoredSettings(storageKey, settings);
    if (originalRef.current) void accept(originalRef.current, settings);
  }

  function commitWidthDraft(): void {
    const parsed = clampWidth(Number(widthDraft));
    if (parsed !== width) applySettings({ width: parsed });
    else setWidthDraft(String(width));
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing && !(target instanceof HTMLInputElement && target.type === 'file')) return;

      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void accept(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) void accept(file);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={entityId} />

      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border border-dashed px-5 py-5 transition-colors duration-[var(--dur-fast)] ${
          dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-strong)]'
        }`}
      >
        <p className="text-[0.875rem] text-[var(--text-secondary)]">
          <kbd className="rounded border border-[var(--border-strong)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[var(--text)]">Ctrl</kbd>
          {' + '}
          <kbd className="rounded border border-[var(--border-strong)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[var(--text)]">V</kbd>
          {' '}para pegar una imagen del portapapeles, arrastrala acá, o elegí un archivo.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
            Archivo
          </span>
          <input
            ref={inputRef}
            type="file"
            name="image"
            accept={ACCEPT}
            required
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void accept(file);
            }}
            className="block w-full text-[0.875rem] text-[var(--text-secondary)] file:mr-3 file:rounded-full file:border file:border-[var(--border-strong)] file:bg-transparent file:px-4 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-[var(--text)]"
          />
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-[0.875rem] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={optimize}
            onChange={(event) => applySettings({ optimize: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium text-[var(--text)]">Optimizar</span>
            {' '}— reducir a {width} px de ancho y convertir a WebP antes de subir. Los SVG no se tocan.
          </span>
        </label>

        {/* El ancho: cuatro pastillas para los tamaños de siempre y un campo
            para cualquier otro. La pastilla marcada es la que coincide con el
            campo; un valor a mano no marca ninguna. */}
        <div
          role="group"
          aria-label="Ancho de la optimización"
          className={`mt-3 flex flex-wrap items-center gap-2 transition-opacity duration-[var(--dur-fast)] ${
            optimize ? '' : 'pointer-events-none opacity-40'
          }`}
        >
          {OPTIMIZE_PRESETS.map((preset) => {
            const active = preset === width;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => applySettings({ width: preset })}
                className={`rounded-full border px-3 py-1 text-[0.75rem] font-medium tabular-nums transition-colors duration-[var(--dur-fast)] ${
                  active
                    ? 'border-[var(--text)] bg-[var(--text)] text-[var(--text-inverted)]'
                    : 'border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {preset} px
              </button>
            );
          })}
          <label className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
            <span>otro:</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_WIDTH}
              max={MAX_WIDTH}
              step={1}
              value={widthDraft}
              onChange={(event) => setWidthDraft(event.target.value)}
              onBlur={commitWidthDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitWidthDraft();
                }
              }}
              aria-label="Ancho en píxeles"
              className="w-[4.5rem] rounded-full border border-[var(--border-strong)] bg-transparent px-2.5 py-1 text-[0.75rem] tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <span>px</span>
          </label>
        </div>

        {busy && (
          <p className="mt-3 text-[0.8125rem] text-[var(--text-tertiary)]">Optimizando…</p>
        )}

        {preview && !busy && (
          <div className="mt-4 flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={preview.url} alt="" className="h-full w-full object-contain p-1" />
            </div>
            <p className="min-w-0 text-[0.8125rem] text-[var(--text-secondary)]">
              <span className="block truncate font-mono text-[var(--text)]">{preview.name}</span>
              {preview.originalSize !== undefined ? (
                <>
                  <span className="line-through opacity-60">{(preview.originalSize / 1024).toFixed(0)} KB</span>
                  {' → '}
                  <span className="text-[var(--price-win)]">{(preview.size / 1024).toFixed(0)} KB</span>
                  {' · lista para subir'}
                </>
              ) : (
                <>{(preview.size / 1024).toFixed(0)} KB · lista para subir</>
              )}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[0.8125rem] text-[var(--critical)]">
            {error}
          </p>
        )}
      </div>

      <button type="submit" disabled={busy} className={`${buttonClass} disabled:opacity-40`}>
        Subir imagen
      </button>
    </form>
  );
}
