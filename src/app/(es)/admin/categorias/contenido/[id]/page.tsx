import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { categoryPaths } from '@/lib/seo/categorySeo';
import { getCategoryForContent, type CategoryContentFields } from '@/server/services/categoryContent';
import { ImageUploader } from '@/features/admin-shared/ImageUploader';
import { removeImageAction, saveContentAction, uploadImageAction } from '../actions';

/**
 * Formulario de contenido de una categoría: imagen (Storage), destacado y
 * texto SEO en español e inglés. Todo por server actions; sin JS propio.
 */
export const metadata: Metadata = { title: 'Editar contenido de categoría', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}

const inputClass =
  'w-full border-0 border-b border-[var(--border-strong)] bg-transparent px-0 py-2 text-[0.9375rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]';
const textareaClass = `${inputClass} min-h-[6rem] resize-y leading-[1.55]`;
const buttonClass =
  'rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]';
const ghostButtonClass =
  'rounded-full border border-[var(--border-strong)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)]';

export default async function CategoryContentEditPage({ params, searchParams }: PageProps) {
  const [{ id }, { status, message }] = await Promise.all([params, searchParams]);
  const row = await getCategoryForContent(id);
  if (!row) notFound();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin/categorias/contenido" className="text-[var(--accent)] hover:opacity-70">
              ← Contenido de categorías
            </Link>
          </p>
          <h1 className="enter mt-6 text-[clamp(2rem,5vw,3.25rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            {row.name}
          </h1>
          <p className="enter mt-3 flex flex-wrap gap-x-4 text-[0.8125rem] text-[var(--text-tertiary)]">
            <span className="font-mono">/{row.slug}</span>
            <span>{row.level === 0 ? 'raíz' : 'subcategoría'}</span>
            <Link href={categoryPaths(row.slug).es} target="_blank" className="text-[var(--accent)] hover:opacity-70">
              Ver página ES
            </Link>
            <Link href={categoryPaths(row.slug).en} target="_blank" className="text-[var(--accent)] hover:opacity-70">
              Ver página EN
            </Link>
          </p>

          {status === 'saved' && (
            <p role="status" className="mt-6 rounded-2xl bg-[var(--price-win-soft)] px-4 py-3 text-[0.875rem] text-[var(--price-win)]">
              Guardado. Las páginas afectadas ya se regeneraron.
            </p>
          )}
          {status === 'error' && (
            <p role="alert" className="mt-6 rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
              {message ?? 'No se pudo guardar.'}
            </p>
          )}
        </div>
      </header>

      <main className="px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl space-y-14">
          {/* Imagen ------------------------------------------------------- */}
          <section>
            <SectionTitle
              title="Imagen"
              hint="Recorte de producto sobre fondo blanco o transparente, idealmente cuadrado, hasta 5 MB. Podés pegarla directo del portapapeles. Se muestra en la cabecera de la página, en la tarjeta de las listas y como imagen de vista previa al compartir."
            />
            <div className="mt-6 grid gap-6 sm:grid-cols-[12rem_1fr]">
              <div className="aspect-square overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)]">
                {row.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- imagen externa (Storage), como en ProductTile */
                  <img src={row.imageUrl} alt={row.imageAlt ?? row.name} className="h-full w-full object-contain p-4" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-serif text-6xl text-[var(--accent)] italic">
                    {row.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                <ImageUploader
                  entityId={row.id}
                  action={uploadImageAction}
                  buttonClass={buttonClass}
                />
                {row.imageUrl && (
                  <form action={removeImageAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit" className={ghostButtonClass}>
                      Quitar imagen
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          {/* Texto ------------------------------------------------------- */}
          <form action={saveContentAction} className="space-y-14">
            <input type="hidden" name="id" value={row.id} />

            <section>
              <SectionTitle
                title="Presentación"
                hint="El texto alternativo describe la imagen para lectores de pantalla y para Google Imágenes. La posición de destacada la pone en «Categorías populares» del índice; vacío = no destacada."
              />
              <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_10rem]">
                <Field label="Texto alternativo de la imagen">
                  <input name="image_alt" defaultValue={row.imageAlt ?? ''} placeholder={row.name} className={inputClass} />
                </Field>
                <Field label="Posición destacada">
                  <input
                    name="featured_position"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={row.featuredPosition ?? ''}
                    placeholder="—"
                    className={`${inputClass} tabular-nums`}
                  />
                </Field>
              </div>
            </section>

            <LocaleFields locale="es" label="Español" fields={row.content.es} name={row.name} />
            <LocaleFields locale="en" label="English" fields={row.content.en} name={row.name} />

            <div className="flex items-center gap-4 border-t border-[var(--border)] pt-8">
              <button type="submit" className={buttonClass}>
                Guardar contenido
              </button>
              <Link href="/admin/categorias/contenido" className="text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)]">
                Volver a la lista
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">{title}</h2>
      <p className="mt-1 max-w-[70ch] text-[0.8125rem] leading-[1.55] text-[var(--text-tertiary)]">{hint}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6875rem] tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.75rem] text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

function LocaleFields({
  locale,
  label,
  fields,
  name,
}: {
  locale: 'es' | 'en';
  label: string;
  fields: CategoryContentFields;
  name: string;
}) {
  const p = (field: string) => `${locale}_${field}`;
  return (
    <section>
      <SectionTitle
        title={`Texto SEO · ${label}`}
        hint="Todo opcional. Título: el <title> del resultado de búsqueda (el H1 siempre es el nombre de la categoría). Descripción: la meta description (~155 caracteres). Intro: el párrafo bajo el título. Cuerpo: el bloque largo del final, en Markdown simple (## subtítulo, párrafos, - listas, **negrita**). Palabras clave: una por línea."
      />
      <div className="mt-6 space-y-6">
        <Field label="Título">
          <input name={p('title')} defaultValue={fields.title} placeholder={name} className={inputClass} />
        </Field>
        <Field label="Meta description">
          <textarea name={p('meta_description')} defaultValue={fields.metaDescription} maxLength={320} className={`${textareaClass} min-h-[4rem]`} />
        </Field>
        <Field label="Intro">
          <textarea name={p('intro')} defaultValue={fields.intro} className={textareaClass} />
        </Field>
        <Field label="Cuerpo (Markdown simple)">
          <textarea name={p('body')} defaultValue={fields.body} className={`${textareaClass} min-h-[16rem] font-mono text-[0.8125rem]`} />
        </Field>
        <Field label="Palabras clave" hint="Una por línea. Se suman a las que se derivan del nombre de la categoría.">
          <textarea name={p('keywords')} defaultValue={fields.keywords.join('\n')} className={`${textareaClass} font-mono text-[0.8125rem]`} />
        </Field>
      </div>
    </section>
  );
}
