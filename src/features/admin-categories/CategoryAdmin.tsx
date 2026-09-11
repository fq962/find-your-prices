'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react';
import type { CanonicalCategory, CanonicalUsage, StoreCategoryRow, StoreOption } from './types';

/**
 * Panel de categorías.
 *
 * Dos mitades. Arriba, las categorías de tienda: se filtran, se marcan varias
 * y se mandan a un nodo del árbol canónico de una vez. Cada fila dice a qué
 * nodo apunta hoy, que es lo que permite ver de un vistazo un mapeo malo.
 * Abajo, el árbol canónico: alta, renombrado, mover de madre, activar y
 * borrar.
 *
 * Sigue el criterio visual del panel de scraping: filas con línea de pelo,
 * cifra grande en el encabezado, sin cajas dentro de cajas. La cifra que
 * manda acá es cuántos artículos siguen sin categoría, porque es el trabajo
 * pendiente.
 */

interface Props {
  categories: CanonicalCategory[];
  storeCategories: StoreCategoryRow[];
  stores: StoreOption[];
  usage: Record<string, CanonicalUsage>;
}

type MappingFilter = 'unmapped' | 'mapped' | 'all';

/** Cuántas filas se pintan antes de pedir el resto: 2600 filas de golpe no se leen. */
const PAGE = 120;

const numberFormatter = new Intl.NumberFormat('es-HN');

interface TreeNode extends CanonicalCategory {
  children: TreeNode[];
}

/** Árbol a partir de las filas planas, respetando `position` y luego nombre. */
function buildTree(categories: CanonicalCategory[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const category of categories) nodes.set(category.id, { ...category, children: [] });
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byOrder = (a: TreeNode, b: TreeNode) =>
    a.position - b.position || a.name.localeCompare(b.name, 'es');
  roots.sort(byOrder);
  for (const root of roots) root.children.sort(byOrder);
  return roots;
}

export function CategoryAdmin({ categories, storeCategories, stores, usage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [filter, setFilter] = useState<MappingFilter>('unmapped');
  const [storeId, setStoreId] = useState<string>('');
  const [term, setTerm] = useState('');
  const [onlyWithProducts, setOnlyWithProducts] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<{ ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  /** "Juguetería y Juegos › Muñecas" para un id canónico. */
  const canonicalLabel = (id: string | null): string | null => {
    if (!id) return null;
    const node = categoryById.get(id);
    if (!node) return '(nodo borrado)';
    const parent = node.parent_id ? categoryById.get(node.parent_id) : undefined;
    return parent ? `${parent.name} › ${node.name}` : node.name;
  };

  const totals = useMemo(() => {
    let unmappedRows = 0;
    let unmappedProducts = 0;
    let mappedRows = 0;
    for (const row of storeCategories) {
      if (row.category_id) mappedRows += 1;
      else {
        unmappedRows += 1;
        unmappedProducts += row.live_count;
      }
    }
    return { unmappedRows, unmappedProducts, mappedRows };
  }, [storeCategories]);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return storeCategories
      .filter((row) => {
        if (filter === 'unmapped' && row.category_id) return false;
        if (filter === 'mapped' && !row.category_id) return false;
        if (storeId && row.store_id !== storeId) return false;
        if (onlyWithProducts && row.live_count === 0) return false;
        if (needle) {
          const haystack = `${row.store_path} ${row.external_id} ${canonicalLabel(row.category_id) ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.live_count - a.live_count || a.store_path.localeCompare(b.store_path, 'es'));
    // canonicalLabel depende sólo de categoryById, que ya está en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCategories, filter, storeId, onlyWithProducts, term, categoryById]);

  /**
   * La selección se recorta a lo visible al leerla, no con un efecto: marcar
   * algo, cambiar de tienda y mandar el lote sin verlo es un error fácil de
   * cometer, y así lo oculto nunca viaja. Lo mismo con el corte de página:
   * un filtro nuevo vuelve a la primera.
   */
  const visibleIds = useMemo(() => new Set(visible.map((row) => row.id)), [visible]);
  const selectedVisible = useMemo(
    () => new Set([...selected].filter((id) => visibleIds.has(id))),
    [selected, visibleIds],
  );
  const [limitFor, setLimitFor] = useState<{ key: Set<string>; limit: number } | null>(null);
  const limit = limitFor?.key === visibleIds ? limitFor.limit : PAGE;
  const setLimit = (next: number) => setLimitFor({ key: visibleIds, limit: next });

  const shown = visible.slice(0, limit);
  const allShownSelected = shown.length > 0 && shown.every((row) => selectedVisible.has(row.id));

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `La petición falló con estado ${response.status}`);
    }
    return payload;
  }

  function withFeedback(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    action()
      .then((text) => {
        setMessage({ tone: 'ok', text });
        startTransition(() => router.refresh());
      })
      .catch((error: unknown) => {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => setBusy(false));
  }

  function assign(ids: string[], categoryId: string | null) {
    withFeedback(async () => {
      const payload = await call('/api/admin/categories/mappings', {
        method: 'PATCH',
        body: JSON.stringify({ store_category_ids: ids, category_id: categoryId }),
      });
      setSelected(new Set());
      setPicker(null);
      const target = categoryId ? canonicalLabel(categoryId) : null;
      return target
        ? `${payload.updated} categorías relacionadas con "${target}"`
        : `${payload.updated} categorías sin relación`;
    });
  }

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllShown = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allShownSelected) for (const row of shown) next.delete(row.id);
      else for (const row of shown) next.add(row.id);
      return next;
    });

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-14 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p
            className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase"
            style={{ '--enter-delay': '80ms' } as CSSProperties}
          >
            Find Your Prices · Panel operativo ·{' '}
            <Link href="/admin/scraping" className="text-[var(--accent)] hover:opacity-70">
              Scraping
            </Link>
          </p>

          <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="enter min-w-0" style={{ '--enter-delay': '200ms' } as CSSProperties}>
              <span className="block text-[clamp(4.5rem,15vw,13rem)] leading-[0.82] font-semibold tracking-[-0.05em] tabular-nums text-[var(--text)]">
                {numberFormatter.format(totals.unmappedProducts)}
              </span>
              <span className="mt-5 block text-[0.8125rem] tracking-[0.02em] text-[var(--text-secondary)]">
                artículos comprables en{' '}
                <span className="text-[var(--text)]">
                  {numberFormatter.format(totals.unmappedRows)} categorías de tienda sin relacionar
                </span>
              </span>
            </div>

            <dl
              className="enter grid shrink-0 grid-cols-3 gap-x-10 gap-y-1 lg:pb-3"
              style={{ '--enter-delay': '340ms' } as CSSProperties}
            >
              <Metric label="Relacionadas" value={numberFormatter.format(totals.mappedRows)} />
              <Metric label="Nodos" value={String(categories.length)} />
              <Metric label="Tiendas" value={String(stores.length)} />
            </dl>
          </div>

          <p
            className="enter-fade mt-12 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]"
            style={{ '--enter-delay': '460ms' } as CSSProperties}
          >
            Cada tienda publica su propio árbol. Relacionar una categoría de tienda con un nodo
            del árbol propio hace que sus artículos aparezcan bajo ese nodo en el catálogo. Lo que
            no se relaciona cae en «Sin categorizar aún».
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-32 sm:px-10 lg:px-16">
        {message && (
          <div
            role="status"
            className={`mt-10 flex items-start gap-3 border-l-2 py-3 pl-4 text-[0.875rem] ${
              message.tone === 'ok'
                ? 'border-emerald-500 text-[var(--text)]'
                : 'border-red-500 text-red-600 dark:text-red-400'
            }`}
            style={{ animation: 'fyp-rise 420ms var(--ease-out-expo) both' }}
          >
            <span className="tabular-nums">{message.text}</span>
          </div>
        )}

        {/* ---------------------------------------------------------------
            Categorías de tienda
           --------------------------------------------------------------- */}
        <section className="mt-16">
          <div
            className="enter-fade flex flex-wrap items-baseline justify-between gap-6 border-b border-[var(--border)] pb-4"
            style={{ '--enter-delay': '560ms' } as CSSProperties}
          >
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em]">Categorías de tienda</h2>
            <span className="text-[0.8125rem] tabular-nums text-[var(--text-tertiary)]">
              {numberFormatter.format(visible.length)} de {numberFormatter.format(storeCategories.length)}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.8125rem]">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'unmapped', label: 'Sin relacionar' },
                { value: 'mapped', label: 'Relacionadas' },
                { value: 'all', label: 'Todas' },
              ]}
            />

            <select
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              className={FIELD}
              aria-label="Tienda"
            >
              <option value="">Todas las tiendas</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>

            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Buscar por nombre, código o nodo"
              aria-label="Buscar"
              className={`${FIELD} min-w-[16rem]`}
            />

            <label className="flex cursor-pointer items-center gap-2 text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={onlyWithProducts}
                onChange={(event) => setOnlyWithProducts(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Solo con artículos
            </label>
          </div>

          {/* Barra de lote: aparece con la primera casilla marcada. */}
          {selectedVisible.size > 0 && (
            <div
              className="sticky top-0 z-10 mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--border)] bg-[var(--bg)]/95 py-3 text-[0.8125rem] backdrop-blur"
              style={{ animation: 'fyp-rise 320ms var(--ease-out-expo) both' }}
            >
              <span className="font-medium tabular-nums">
                {selected.size} {selected.size === 1 ? 'seleccionada' : 'seleccionadas'}
              </span>
              <PrimaryButton onClick={() => setPicker({ ids: [...selectedVisible] })} disabled={busy}>
                Relacionar con…
              </PrimaryButton>
              <RowAction onClick={() => assign([...selectedVisible], null)} disabled={busy} tone="danger">
                Quitar relación
              </RowAction>
              <RowAction onClick={() => setSelected(new Set())} disabled={busy}>
                Limpiar
              </RowAction>
            </div>
          )}

          {shown.length === 0 ? (
            <Empty
              title="Nada que mostrar"
              body={
                filter === 'unmapped' && !term && !storeId
                  ? 'Todas las categorías de tienda con artículos ya están relacionadas.'
                  : 'Probá con otro filtro o sin «Solo con artículos».'
              }
            />
          ) : (
            <table className="mt-4 w-full border-collapse text-[0.875rem]">
              <thead>
                <tr className="text-left text-[0.6875rem] font-medium tracking-[0.12em] text-[var(--text-tertiary)] uppercase">
                  <th className="w-8 py-3 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Marcar todas las visibles"
                      checked={allShownSelected}
                      onChange={toggleAllShown}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  </th>
                  <th className="py-3 pr-4 font-medium">Tienda</th>
                  <th className="py-3 pr-4 font-medium">Categoría de la tienda</th>
                  <th className="py-3 pr-4 text-right font-medium">Artículos</th>
                  <th className="py-3 pr-4 font-medium">Relacionada con</th>
                  <th className="py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-[var(--border)] align-top transition-colors duration-[var(--dur-fast)] ${
                      selected.has(row.id) ? 'bg-[var(--bg-subtle)]' : 'hover:bg-[var(--bg-subtle)]/60'
                    }`}
                  >
                    <td className="py-3 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Marcar ${row.name}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {row.store_name}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block font-medium">{row.name}</span>
                      {row.store_path !== row.name && (
                        <span className="mt-0.5 block text-[0.75rem] text-[var(--text-tertiary)]">
                          {row.store_path}
                        </span>
                      )}
                      <span className="mt-0.5 block font-mono text-[0.6875rem] text-[var(--text-tertiary)]">
                        {row.external_id}
                        {!row.is_active && ' · inactiva en la tienda'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {numberFormatter.format(row.live_count)}
                      {row.reported_count !== null && row.reported_count !== row.live_count && (
                        <span className="block text-[0.6875rem] text-[var(--text-tertiary)]">
                          tienda dice {numberFormatter.format(row.reported_count)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {row.category_id ? (
                        <span className="text-[var(--text)]">{canonicalLabel(row.category_id)}</span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <RowAction onClick={() => setPicker({ ids: [row.id] })} disabled={busy}>
                        {row.category_id ? 'Reasignar' : 'Relacionar'}
                      </RowAction>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {visible.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit(limit + PAGE)}
              className="mt-6 text-[0.8125rem] font-medium text-[var(--accent)] hover:opacity-70"
            >
              Ver más ({numberFormatter.format(visible.length - shown.length)})
            </button>
          )}
        </section>

        {/* ---------------------------------------------------------------
            Árbol canónico
           --------------------------------------------------------------- */}
        <CanonicalTreeSection
          tree={tree}
          categories={categories}
          usage={usage}
          busy={busy}
          call={call}
          withFeedback={withFeedback}
        />
      </main>

      {picker && (
        <CategoryPicker
          tree={tree}
          usage={usage}
          count={picker.ids.length}
          busy={busy}
          onCancel={() => setPicker(null)}
          onConfirm={(categoryId) => assign(picker.ids, categoryId)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Selector de nodo (modal)
   ------------------------------------------------------------------------- */

function CategoryPicker({
  tree,
  usage,
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  tree: TreeNode[];
  usage: Record<string, CanonicalUsage>;
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (categoryId: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState<TreeNode | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const needle = term.trim().toLowerCase();
  const filtered = needle
    ? tree.flatMap((root) => {
        const rootMatches = root.name.toLowerCase().includes(needle);
        const children = rootMatches
          ? root.children
          : root.children.filter((child) => child.name.toLowerCase().includes(needle));
        return rootMatches || children.length > 0 ? [{ ...root, children }] : [];
      })
    : tree;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Elegir categoría canónica"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
        style={{ animation: 'fyp-rise 320ms var(--ease-out-expo) both' }}
      >
        <div className="border-b border-[var(--border)] px-6 pt-6 pb-4">
          <p className="text-[0.6875rem] font-medium tracking-[0.2em] text-[var(--text-tertiary)] uppercase">
            Relacionar {count} {count === 1 ? 'categoría' : 'categorías'}
          </p>
          <input
            autoFocus
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar nodo"
            aria-label="Buscar nodo"
            className={`${FIELD} mt-3 w-full`}
          />
        </div>

        <ul className="m-0 flex-1 list-none overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-[0.8125rem] text-[var(--text-tertiary)]">
              Sin coincidencias
            </li>
          )}
          {filtered.map((root) => (
            <li key={root.id}>
              <PickerRow node={root} usage={usage} chosen={chosen} onChoose={setChosen} />
              {root.children.length > 0 && (
                <ul className="m-0 list-none p-0 pl-5">
                  {root.children.map((child) => (
                    <li key={child.id}>
                      <PickerRow node={child} usage={usage} chosen={chosen} onChoose={setChosen} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] px-6 py-4">
          <span className="min-w-0 truncate text-[0.8125rem] text-[var(--text-secondary)]">
            {chosen ? chosen.name : 'Elegí un nodo'}
          </span>
          <div className="flex shrink-0 items-center gap-4">
            <RowAction onClick={onCancel} disabled={busy}>
              Cancelar
            </RowAction>
            <PrimaryButton onClick={() => chosen && onConfirm(chosen.id)} disabled={!chosen || busy}>
              {busy ? 'Guardando…' : 'Relacionar'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function PickerRow({
  node,
  usage,
  chosen,
  onChoose,
}: {
  node: TreeNode;
  usage: Record<string, CanonicalUsage>;
  chosen: TreeNode | null;
  onChoose: (node: TreeNode) => void;
}) {
  const isChosen = chosen?.id === node.id;
  const use = usage[node.id];
  return (
    <button
      type="button"
      onClick={() => onChoose(node)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[0.875rem] transition-colors duration-[var(--dur-fast)] ${
        isChosen
          ? 'bg-[var(--text)] text-[var(--text-inverted)]'
          : 'hover:bg-[var(--bg-subtle)]'
      } ${!node.is_active && !isChosen ? 'opacity-50' : ''}`}
    >
      <span className={node.level === 0 ? 'font-medium' : ''}>
        {node.name}
        {!node.is_active && ' · inactiva'}
      </span>
      {use && (
        <span className={`shrink-0 text-[0.6875rem] tabular-nums ${isChosen ? 'opacity-70' : 'text-[var(--text-tertiary)]'}`}>
          {use.storeCategories} · {numberFormatter.format(use.products)}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------
   Mantenimiento del árbol
   ------------------------------------------------------------------------- */

interface NodeDraft {
  /** `null` es alta; un id es edición. */
  id: string | null;
  parent_id: string | null;
  name: string;
  slug: string;
}

function CanonicalTreeSection({
  tree,
  categories,
  usage,
  busy,
  call,
  withFeedback,
}: {
  tree: TreeNode[];
  categories: CanonicalCategory[];
  usage: Record<string, CanonicalUsage>;
  busy: boolean;
  call: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  withFeedback: (action: () => Promise<string>) => void;
}) {
  const [draft, setDraft] = useState<NodeDraft | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const roots = categories.filter((category) => category.parent_id === null);

  function save() {
    if (!draft) return;
    const body = { name: draft.name, slug: draft.slug, parent_id: draft.parent_id };
    withFeedback(async () => {
      if (draft.id) {
        await call(`/api/admin/categories/${draft.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await call('/api/admin/categories', { method: 'POST', body: JSON.stringify(body) });
      }
      setDraft(null);
      return `"${draft.name}" ${draft.id ? 'guardada' : 'creada'}`;
    });
  }

  function toggleActive(node: TreeNode) {
    withFeedback(async () => {
      await call(`/api/admin/categories/${node.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !node.is_active }),
      });
      return `"${node.name}" ${node.is_active ? 'desactivada' : 'activada'}`;
    });
  }

  function remove(node: TreeNode) {
    if (!window.confirm(`¿Borrar "${node.name}"? Solo se puede si nada cuelga de ella.`)) return;
    withFeedback(async () => {
      await call(`/api/admin/categories/${node.id}`, { method: 'DELETE' });
      return `"${node.name}" borrada`;
    });
  }

  const toggleCollapsed = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const form = draft && (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="my-3 grid grid-cols-1 gap-3 border-l-2 border-[var(--accent)] py-3 pl-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      style={{ animation: 'fyp-rise 320ms var(--ease-out-expo) both' }}
    >
      <label className="flex flex-col gap-1 text-[0.6875rem] tracking-[0.12em] text-[var(--text-tertiary)] uppercase">
        Nombre
        <input
          autoFocus
          required
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className={`${FIELD} normal-case tracking-normal`}
        />
      </label>
      <label className="flex flex-col gap-1 text-[0.6875rem] tracking-[0.12em] text-[var(--text-tertiary)] uppercase">
        Slug <span className="normal-case tracking-normal">(vacío = del nombre)</span>
        <input
          value={draft.slug}
          onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          className={`${FIELD} font-mono normal-case tracking-normal`}
        />
      </label>
      <label className="flex flex-col gap-1 text-[0.6875rem] tracking-[0.12em] text-[var(--text-tertiary)] uppercase">
        Madre
        <select
          value={draft.parent_id ?? ''}
          onChange={(event) => setDraft({ ...draft, parent_id: event.target.value || null })}
          className={`${FIELD} normal-case tracking-normal`}
        >
          <option value="">— raíz —</option>
          {roots
            .filter((root) => root.id !== draft.id)
            .map((root) => (
              <option key={root.id} value={root.id}>
                {root.name}
              </option>
            ))}
        </select>
      </label>
      <div className="flex items-center gap-4 pb-2">
        <PrimaryButton type="submit" disabled={busy || !draft.name.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </PrimaryButton>
        <RowAction onClick={() => setDraft(null)} disabled={busy}>
          Cancelar
        </RowAction>
      </div>
    </form>
  );

  const startEdit = (node: TreeNode) =>
    setDraft({ id: node.id, parent_id: node.parent_id, name: node.name, slug: node.slug });
  const startCreate = (parentId: string | null) =>
    setDraft({ id: null, parent_id: parentId, name: '', slug: '' });

  return (
    <section className="mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-6 border-b border-[var(--border)] pb-4">
        <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em]">Árbol canónico</h2>
        <button
          type="button"
          onClick={() => startCreate(null)}
          disabled={busy}
          className="text-[0.8125rem] font-medium text-[var(--accent)] hover:opacity-70 disabled:opacity-30"
        >
          + Nueva raíz
        </button>
      </div>

      {draft && draft.id === null && draft.parent_id === null && form}

      <ul className="m-0 list-none p-0">
        {tree.map((root) => (
          <li key={root.id} className="border-b border-[var(--border)]">
            <NodeRow
              node={root}
              usage={usage}
              busy={busy}
              collapsed={collapsed.has(root.id)}
              onToggleCollapsed={root.children.length > 0 ? () => toggleCollapsed(root.id) : undefined}
              onEdit={() => startEdit(root)}
              onAddChild={() => startCreate(root.id)}
              onToggleActive={() => toggleActive(root)}
              onRemove={() => remove(root)}
            />
            {draft && draft.id === root.id && form}
            {draft && draft.id === null && draft.parent_id === root.id && form}
            {!collapsed.has(root.id) && root.children.length > 0 && (
              <ul className="m-0 list-none p-0 pl-6">
                {root.children.map((child) => (
                  <li key={child.id} className="border-t border-[var(--border)]/60">
                    <NodeRow
                      node={child}
                      usage={usage}
                      busy={busy}
                      onEdit={() => startEdit(child)}
                      onToggleActive={() => toggleActive(child)}
                      onRemove={() => remove(child)}
                    />
                    {draft && draft.id === child.id && form}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NodeRow({
  node,
  usage,
  busy,
  collapsed,
  onToggleCollapsed,
  onEdit,
  onAddChild,
  onToggleActive,
  onRemove,
}: {
  node: TreeNode;
  usage: Record<string, CanonicalUsage>;
  busy: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onEdit: () => void;
  onAddChild?: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const use = usage[node.id];
  const isRoot = node.level === 0;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${isRoot ? 'py-4' : 'py-2.5'}`}>
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Mostrar' : 'Ocultar'} subcategorías de ${node.name}`}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ${collapsed ? '-rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : (
        <span className="h-6 w-6" />
      )}

      <div className="min-w-0 flex-1">
        <span className={`${isRoot ? 'text-[1rem] font-medium' : 'text-[0.875rem]'} ${node.is_active ? '' : 'line-through opacity-60'}`}>
          {node.name}
        </span>
        <span className="ml-3 font-mono text-[0.6875rem] text-[var(--text-tertiary)]">{node.path}</span>
        {node.children.length > 0 && (
          <span className="ml-3 text-[0.6875rem] text-[var(--text-tertiary)]">
            {node.children.length} {node.children.length === 1 ? 'hija' : 'hijas'}
          </span>
        )}
      </div>

      <span className="text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">
        {use ? `${use.storeCategories} rel. · ${numberFormatter.format(use.products)} art.` : 'sin uso'}
      </span>

      <div className="flex items-center gap-4">
        {onAddChild && (
          <RowAction onClick={onAddChild} disabled={busy}>
            + hija
          </RowAction>
        )}
        <RowAction onClick={onEdit} disabled={busy}>
          Editar
        </RowAction>
        <RowAction onClick={onToggleActive} disabled={busy}>
          {node.is_active ? 'Desactivar' : 'Activar'}
        </RowAction>
        <RowAction onClick={onRemove} disabled={busy || Boolean(use) || node.children.length > 0} tone="danger">
          Borrar
        </RowAction>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Piezas
   ------------------------------------------------------------------------- */

const FIELD =
  'h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-[0.8125rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.6875rem] font-medium tracking-[0.12em] text-[var(--text-tertiary)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[1.5rem] font-semibold tracking-[-0.03em] tabular-nums text-[var(--text)]">
        {value}
      </dd>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div role="radiogroup" className="flex rounded-full border border-[var(--border)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1 text-[0.8125rem] transition-colors duration-[var(--dur-fast)] ${
            value === option.value
              ? 'bg-[var(--text)] text-[var(--text-inverted)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-[var(--text)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--text-inverted)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100"
    >
      {children}
    </button>
  );
}

function RowAction({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm text-[0.8125rem] outline-none transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:opacity-60 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)] ${
        tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]'
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-b border-[var(--border)] py-24 text-center">
      <p className="text-[1.25rem] font-medium tracking-[-0.02em]">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  );
}
