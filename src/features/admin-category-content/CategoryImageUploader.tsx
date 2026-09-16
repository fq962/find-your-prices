'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

interface CategoryImageUploaderProps {
  categoryId: string;
  /** La server action que recibe `id` e `image` (ver actions.ts). */
  action: (formData: FormData) => Promise<void>;
  buttonClass: string;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/svg+xml';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Subida de la imagen de categoría por tres caminos: elegir archivo, pegar
 * desde el portapapeles (Ctrl+V / Cmd+V en cualquier parte de la página) o
 * arrastrar y soltar sobre la zona.
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
export function CategoryImageUploader({ categoryId, action, buttonClass }: CategoryImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // La URL de vista previa se libera al reemplazarla o al desmontar.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function accept(file: File): void {
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

    // Un portapapeles entrega el archivo como "image.png": se le pone un
    // nombre con fecha para que se distinga en el bucket.
    const extension = file.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png';
    const named = file.name && file.name !== 'image.png' ? file : new File([file], `pegada-${Date.now()}.${extension}`, { type: file.type });

    const transfer = new DataTransfer();
    transfer.items.add(named);
    input.files = transfer.files;

    setError(null);
    setPreview({ url: URL.createObjectURL(named), name: named.name, size: named.size });
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing && !(target instanceof HTMLInputElement && target.type === 'file')) return;

      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      accept(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) accept(file);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={categoryId} />

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
              if (file) accept(file);
            }}
            className="block w-full text-[0.875rem] text-[var(--text-secondary)] file:mr-3 file:rounded-full file:border file:border-[var(--border-strong)] file:bg-transparent file:px-4 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-[var(--text)]"
          />
        </label>

        {preview && (
          <div className="mt-4 flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={preview.url} alt="" className="h-full w-full object-contain p-1" />
            </div>
            <p className="min-w-0 text-[0.8125rem] text-[var(--text-secondary)]">
              <span className="block truncate font-mono text-[var(--text)]">{preview.name}</span>
              {(preview.size / 1024).toFixed(0)} KB · lista para subir
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[0.8125rem] text-[var(--critical)]">
            {error}
          </p>
        )}
      </div>

      <button type="submit" className={buttonClass}>
        Subir imagen
      </button>
    </form>
  );
}
