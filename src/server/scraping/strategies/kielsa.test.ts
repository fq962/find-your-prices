import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  collectKielsaCategories,
  decodeKielsaDescription,
  kielsaCategoryId,
  kielsaCategoryPath,
  kielsaSlug,
  kielsaStrategy,
  mapKielsaDoc,
  type KielsaDoc,
} from './kielsa';

/** Tres documentos reales de la publicacion ProductFake.category (2026-09-18). */
const RAW = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'kielsa-products.json'), 'utf8')) as Array<Record<string, unknown> & { id: string }>;
const DOCS: KielsaDoc[] = RAW.map(({ id, ...fields }) => ({ _id: id, ...(fields as Omit<KielsaDoc, '_id'>) }));
const BASE = 'https://kielsa.com';

// Servidor DDP simulado con la misma trampa que Kielsa: si skip + pageSize
// supera el total, devuelve nada. Hoisted para que el modulo lo vea al importar.
const fake = vi.hoisted(() => ({ total: 1234, calls: [] as Array<[number, number]> }));
vi.mock('../ddp', () => ({
  DdpClient: class {
    async connect() {}
    close() {}
    async subscribe(_name: string, params: Array<{ page: number; pageSize: number }>) {
      const { page, pageSize } = params[0];
      fake.calls.push([page, pageSize]);
      const skip = page * pageSize;
      if (skip + pageSize > fake.total) return [];
      return Array.from({ length: pageSize }, (_, i) => {
        const n = skip + i;
        return {
          id: `m${n}`,
          collection: 'productFake',
          fields: { Articulo_Id: `sku${n}`, Articulo_Nombre: `Articulo ${n}`, Precio: 10, Precio_con_Descuento: 10, Categoria_Web: n % 2 ? 'A' : 'B', Sub_Categoria_Web: 'NULL' },
        };
      });
    }
  },
}));

describe('kielsa', () => {
  test('articulo sin rebaja, con existencia e imagen en S3', () => {
    const p = mapKielsaDoc(DOCS[0], `${BASE}/`, 'HNL');
    expect(p).toMatchObject({
      external_id: '2412012266',
      sku: '2412012266',
      name: 'KIELSA ALCOHOL CLINICO 250ML',
      url: `${BASE}/productDetail/8GDr2fsCXJmEmuNxG`,
      price: 70.88,
      list_price: null,
      discount_percent: null,
      availability: 'in_stock',
      in_stock: true,
      stock_quantity: 6,
      store_category_external_id: 'primeros-auxilios/antisepticos',
      category_raw: 'Antisépticos',
      category_path: ['Primeros Auxilios', 'Antisépticos'],
      primary_image_url: 'https://kielsaimgrepositorio.s3.us-east-2.amazonaws.com/kimg/2412012266.jpg',
      manufacturer: 'COINSA - ALCOHOL',
      badges: ['marca-propia'],
    });
    expect(p?.description).toBeNull();
    expect(p?.raw).toBeUndefined();
  });

  test('rebaja: precio redondeado a centavos, lista mayor, porcentaje y agotado', () => {
    const p = mapKielsaDoc(DOCS[1], BASE, 'HNL');
    expect(p).toMatchObject({
      external_id: '1110014364',
      price: 515.6,
      list_price: 747.56,
      discount_percent: 31.03,
      discount_amount: 231.96,
      availability: 'out_of_stock',
      in_stock: false,
      category_path: ['Medicamentos', 'Antibióticos'],
    });
    expect(p?.badges).toContain('descuento');
    expect(p?.attributes?.activeIngredient).toBe('AMOXICILINA+ACIDO CLAVULANICO');
    // La descripcion venia como html con encodeURIComponent.
    expect(p?.description).toMatch(/^Requisitos de la promoci/);
    expect(p?.description).not.toContain('%3C');
  });

  test('controlado con imagen en base64: sin imagen, con badge', () => {
    const p = mapKielsaDoc(DOCS[2], BASE, 'HNL');
    expect(p?.primary_image_url).toBeNull();
    expect(p?.images).toEqual([]);
    expect(p?.badges).toEqual(['descuento', 'controlado']);
    expect(p?.tags).toEqual(['Controlado']);
    expect(p?.availability).toBe('in_stock');
  });

  test('descarta documentos sin sku o sin nombre', () => {
    expect(mapKielsaDoc({ _id: 'x', Articulo_Nombre: 'Algo' }, BASE, 'HNL')).toBeNull();
    expect(mapKielsaDoc({ _id: 'x', Articulo_Id: '1' }, BASE, 'HNL')).toBeNull();
  });

  test('categorias: "NULL" corta la rama, ids en slug con acentos fuera', () => {
    expect(kielsaCategoryPath({ Categoria_Web: 'Medicamentos', Sub_Categoria_Web: 'Antibióticos', Sub_Categoria2_Web: 'NULL' })).toEqual(['Medicamentos', 'Antibióticos']);
    expect(kielsaCategoryPath({ Categoria_Web: 'Mundo de Bebé', Sub_Categoria_Web: '', Sub_Categoria2_Web: 'X' })).toEqual(['Mundo de Bebé']);
    expect(kielsaSlug('Mundo de Bebé')).toBe('mundo-de-bebe');
    expect(kielsaCategoryId(['Medicamentos', 'Antibióticos'])).toBe('medicamentos/antibioticos');

    const cats = collectKielsaCategories(
      [['Medicamentos', 'Antibióticos'], ['Medicamentos', 'Sistema Nervioso'], ['Medicamentos', 'Antibióticos'], ['Primeros Auxilios']],
      BASE,
    );
    expect(cats.map((c) => c.external_id)).toEqual(['medicamentos', 'medicamentos/antibioticos', 'medicamentos/sistema-nervioso', 'primeros-auxilios']);
    expect(cats[0]).toMatchObject({ level: 1, external_parent_id: null, product_count: 3, url: `${BASE}/searchproducts/1/Medicamentos/no-one` });
    expect(cats[1]).toMatchObject({ level: 2, external_parent_id: 'medicamentos', product_count: 2, url: null });
  });

  test('descripcion: decodifica y limpia; vacia -> null', () => {
    expect(decodeKielsaDescription('%3Cp%3EHola%20%3Cb%3Emundo%3C%2Fb%3E%3C%2Fp%3E')).toBe('Hola mundo');
    expect(decodeKielsaDescription('texto plano')).toBe('texto plano');
    expect(decodeKielsaDescription('')).toBeNull();
    expect(decodeKielsaDescription(undefined)).toBeNull();
  });

  test('run: baja de tamano al chocar con el final y no pierde la cola', async () => {
    const TOTAL = fake.total;
    const result = await kielsaStrategy.run({
      store: { default_currency: 'HNL' } as never,
      target: { max_pages: 200, kind: 'full_catalog' } as never,
      config: { pageSize: 500, delayMs: 0 },
      http: {} as never,
      signal: new AbortController().signal,
      log: () => {},
    });

    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(TOTAL);
    expect(new Set(result.products.map((p) => p.external_id)).size).toBe(TOTAL);
    expect(result.stats?.complete).toBe(true);
    // 2x500 -> 1000, la 3a de 500 falla; 2x100 -> 1200, falla; 3x10 -> 1230,
    // falla; 4x1 -> 1234, falla: fin. 15 suscripciones para 1234 articulos.
    expect(fake.calls).toEqual([
      [0, 500], [1, 500], [2, 500],
      [10, 100], [11, 100], [12, 100],
      [120, 10], [121, 10], [122, 10], [123, 10],
      [1230, 1], [1231, 1], [1232, 1], [1233, 1], [1234, 1],
    ]);
    expect(result.categories?.map((c) => c.external_id).sort()).toEqual(['a', 'b']);
  });

  test('la estrategia exportada tiene la clave del registro', () => {
    expect(kielsaStrategy.key).toBe('kielsa');
    expect(kielsaStrategy.supports).toEqual(['full_catalog']);
  });
});
