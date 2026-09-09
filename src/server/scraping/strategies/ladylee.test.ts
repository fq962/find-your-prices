import { describe, expect, test } from 'vitest';
import {
  buildLadyleeProductUrl,
  categoryLabel,
  handleFromUrl,
  ladyleeStrategy,
  mapLadyleeProduct,
  stripHtml,
  stripLoneSurrogates,
  toNumber,
  truncate,
} from './ladylee';

/**
 * Los casos de abajo salen de datos reales: productos tal cual los devuelve
 * https://ladylee.net/collections/juguetes/products.json y handles copiados de
 * los enlaces de esa misma pagina. Si Ladylee cambia el formato de sus urls o
 * de sus precios, estas pruebas fallan antes de que el scraper guarde enlaces
 * rotos o descuentos inventados en la base.
 */

const CONFIG = { webBaseUrl: 'https://ladylee.net' };

/** Mitad de un par sustituto sin su pareja: lo que Postgres rechaza. */
function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

/** Articulo real con rebaja de verdad: 1010 -> 404. */
const JENGA = {
  id: 8698521616634,
  title: 'JENGA CLASICO',
  handle: '1048240-jenga-clasico',
  body_html:
    '<!-- ENCABEZADO -->\n<div style="background: linear-gradient(135deg, #B45309 0%, #78350F 100%);">' +
    '<h2 style="color: #FFF;">PULSO FIRME, ESTRATEGIA Y DIVERSION</h2>' +
    '<p>Pon a prueba tu equilibrio con el <strong>Jenga Cl&aacute;sico A2120</strong>.</p></div>',
  published_at: '2025-01-12T22:09:41-06:00',
  created_at: '2025-01-12T22:09:41-06:00',
  updated_at: '2026-09-08T18:42:55-06:00',
  vendor: 'HASBRO',
  product_type: 'LL0308',
  tags: ['1048240', '15012026', 'A2120', 'HASBRO', 'Juegos de estrategias', 'LL030809'],
  variants: [
    {
      id: 47037783802106,
      title: 'Default Title',
      option1: 'Default Title',
      option2: null,
      option3: null,
      sku: '1048240',
      requires_shipping: true,
      taxable: true,
      featured_image: null,
      available: true,
      price: '404.00',
      grams: 907,
      compare_at_price: '1010.00',
      position: 1,
      product_id: 8698521616634,
    },
  ],
  images: [
    {
      id: 42989707690234,
      position: 1,
      product_id: 8698521616634,
      variant_ids: [],
      src: 'https://cdn.shopify.com/s/files/1/0737/9779/6090/files/1048240_01_media_lly515Wx515H.jpg?v=1738537294',
      width: 515,
      height: 515,
    },
  ],
  options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
};

/**
 * Articulo real donde `compare_at_price` repite el precio actual. Ladylee
 * rellena ese campo en TODO el catalogo, tambien sin rebaja: copiarlo tal cual
 * llenaria la portada de ofertas del 0%.
 */
const SIN_DESCUENTO = {
  id: 9036625084666,
  title: 'DINOSAURIO MY8803-2',
  handle: 'dinosaurio-my8803-2',
  body_html: '',
  vendor: 'Lady Lee Honduras',
  product_type: 'LL10',
  tags: ['0', 'Dinosaurios de juguete', 'JUGUETES', 'LL1006'],
  variants: [
    {
      id: 48143595307258,
      title: 'Default Title',
      option1: 'Default Title',
      sku: '30009716',
      available: true,
      price: '85.00',
      grams: 454,
      compare_at_price: '85.00',
      position: 1,
      product_id: 9036625084666,
    },
  ],
  images: [
    {
      id: 1,
      position: 1,
      src: 'https://cdn.shopify.com/s/files/1/0737/9779/6090/files/descarga.webp?v=1774387368',
      width: 800,
      height: 800,
    },
  ],
  options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
};

/**
 * Handles reales tomados de los `href` de /collections/juguetes, cruzados
 * contra los que devuelve products.json de esa misma pagina. Las 24
 * coincidencias son las que exige la seccion 4 del README: la url no se
 * adivina, se verifica.
 */
const HANDLES_REALES = [
  '1023884-hot-wheels-carritos-sur',
  '1048240-jenga-clasico',
  '1078038-juego-de-mesa-risk',
  '1083011-play-doh-paquete-de-4-mini-tarros',
  '1087785-juego-de-mesa-ajedrez',
  '1088667-play-doh-paquete-de-8-unidades',
  '1091545-cars-color-changer-carrito-surtido',
  '1096835-hw-city-mega-garage',
  '1098912-hot-wheels-nemesis-gorila',
  '1099710-disney-pixar-cars-surtido-de-autos-basic',
  '1099834-uno-all-wild',
  '1100100-marvel-spiderman-moto-y-figura-surtido',
];

describe('buildLadyleeProductUrl', () => {
  // Shopify entrega el handle ya resuelto: no hay que reconstruir el slug ni
  // adivinar como trata los apostrofes o los acentos, que es donde Diunsa
  // rompia enlaces en silencio.
  test('arma /products/{handle} sin prefijo de coleccion', () => {
    expect(buildLadyleeProductUrl('1048240-jenga-clasico', 'https://ladylee.net')).toBe(
      'https://ladylee.net/products/1048240-jenga-clasico',
    );
  });

  test('tolera una base con barra final', () => {
    expect(buildLadyleeProductUrl('uno-all-wild', 'https://ladylee.net/')).toBe(
      'https://ladylee.net/products/uno-all-wild',
    );
  });

  test('coincide con los enlaces reales de la pagina de Juguetes', () => {
    for (const handle of HANDLES_REALES) {
      expect(mapLadyleeProduct({ id: 1, title: 'X', handle }, CONFIG, 'HNL')?.url).toBe(
        `https://ladylee.net/products/${handle}`,
      );
    }
  });
});

describe('categoryLabel', () => {
  // Los titulos de coleccion de Ladylee estan escritos para posicionamiento:
  // "cuidado-personal" se titula "Articulos de Cuidado Personal en Honduras:
  // Belleza y Bienestar". En el comparador tiene que leerse el rotulo del menu.
  test('prefiere el rotulo del menu sobre el titulo seo de Shopify', () => {
    expect(
      categoryLabel('cuidado-personal', 'Artículos de Cuidado Personal en Honduras: Belleza y Bienestar'),
    ).toBe('Cuidado Personal');
    expect(categoryLabel('celulares', 'Celulares en Honduras')).toBe('Celulares y Tablets');
  });

  test('cae en el titulo de Shopify para una coleccion desconocida', () => {
    expect(categoryLabel('literas', 'Camarotes')).toBe('Camarotes');
    expect(categoryLabel('literas')).toBe('literas');
  });
});

describe('handleFromUrl', () => {
  test('extrae el handle de una url de coleccion', () => {
    expect(handleFromUrl('https://ladylee.net/collections/juguetes')).toBe('juguetes');
    expect(handleFromUrl('https://ladylee.net/collections/curiosidades-y-mas?page=2')).toBe(
      'curiosidades-y-mas',
    );
  });

  test('devuelve null cuando la url no apunta a una coleccion', () => {
    expect(handleFromUrl('https://ladylee.net/products/uno-all-wild')).toBeNull();
    expect(handleFromUrl(null)).toBeNull();
  });
});

describe('toNumber', () => {
  test('convierte los precios en string de Shopify', () => {
    expect(toNumber('404.00')).toBe(404);
    expect(toNumber(85)).toBe(85);
  });

  test('descarta vacios y basura', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('N/D')).toBeNull();
  });
});

describe('stripHtml', () => {
  test('deja solo el texto de las plantillas de marketing', () => {
    const text = stripHtml(JENGA.body_html);
    expect(text).toContain('PULSO FIRME');
    expect(text).toContain('Jenga Clásico A2120');
    expect(text).not.toContain('<div');
    expect(text).not.toContain('linear-gradient');
  });

  test('devuelve cadena vacia sin descripcion', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml('')).toBe('');
  });
});

describe('truncate y stripLoneSurrogates', () => {
  /**
   * Caso REAL que rompió la ingesta del catálogo completo.
   *
   * "BARBIE FIESTA EN LA PLAYA SURT." (id 8698639384826) tiene un 🏖 justo en
   * el carácter 300 de su descripción. `slice(0, 300)` cortaba por unidad
   * UTF-16 y dejaba la mitad alta del par (`\uD83C`) suelta: JavaScript lo
   * acepta, `JSON.stringify` lo escribe como `\ud83c`, y Postgres rechaza ese
   * escape al armar el jsonb. PostgREST devolvía una respuesta sin cuerpo y
   * supabase-js informaba "Empty or invalid json" — un mensaje que no nombra
   * ni el campo ni el artículo. Los lotes 500-750 en adelante nunca entraban.
   */
  const CON_EMOJI = `${'a'.repeat(299)}🏖 y mas texto detras`;

  test('slice partiria el emoji; truncate no', () => {
    // Se documenta el comportamiento roto para que nadie lo reintroduzca.
    expect(hasLoneSurrogate(CON_EMOJI.slice(0, 300))).toBe(true);
    expect(hasLoneSurrogate(truncate(CON_EMOJI, 300))).toBe(false);
  });

  test('no recorta lo que ya entra', () => {
    expect(truncate('corto', 300)).toBe('corto');
  });

  test('cierra en el ultimo espacio para no partir palabras', () => {
    expect(truncate('uno dos tres cuatro cinco', 22)).toBe('uno dos tres cuatro');
  });

  test('stripLoneSurrogates deja intacto el emoji completo', () => {
    expect(stripLoneSurrogates('sol 🏖 playa')).toBe('sol 🏖 playa');
    expect(stripLoneSurrogates('roto \uD83C fin')).toBe('roto  fin');
    expect(stripLoneSurrogates('roto \uDFD6 fin')).toBe('roto  fin');
  });

  test('la descripcion que sale de stripHtml nunca lleva medio emoji', () => {
    expect(hasLoneSurrogate(stripHtml(`<p>playa \uD83C</p>`))).toBe(false);
  });
});

describe('mapLadyleeProduct', () => {
  const jenga = mapLadyleeProduct(JENGA, CONFIG, 'HNL', { handle: 'juguetes', title: 'JUGUETES' })!;

  test('usa el id de Shopify como external_id', () => {
    // El id numerico es la clave primaria del producto: sobrevive a cambios de
    // nombre, de handle y de categoria. Tomarlo del handle partiria el
    // historico de precios cada vez que Ladylee renombre un articulo.
    expect(jenga.external_id).toBe('8698521616634');
    expect(jenga.slug).toBe('1048240-jenga-clasico');
  });

  test('convierte los precios a numero', () => {
    expect(jenga.price).toBe(404);
    expect(jenga.list_price).toBe(1010);
    expect(jenga.discount_amount).toBe(606);
    expect(jenga.discount_percent).toBe(60);
    expect(jenga.currency).toBe('HNL');
  });

  test('descarta list_price cuando no hay descuento real', () => {
    const sinDescuento = mapLadyleeProduct(SIN_DESCUENTO, CONFIG, 'HNL')!;
    expect(sinDescuento.price).toBe(85);
    expect(sinDescuento.list_price).toBeNull();
    expect(sinDescuento.discount_percent).toBeNull();
    expect(sinDescuento.discount_amount).toBeNull();
    expect(sinDescuento.badges).not.toContain('descuento');
  });

  test('mapea marca, sku y peso', () => {
    expect(jenga.brand_raw).toBe('HASBRO');
    expect(jenga.sku).toBe('1048240');
    expect(jenga.external_code).toBe('1048240');
    expect(jenga.weight_grams).toBe(907);
  });

  test('trata grams=0 como peso ausente, no como articulo sin peso', () => {
    // Shopify manda 0 cuando nadie configuro el peso del articulo. Guardarlo
    // haria creer que la RIZADORA DE PELO CALOR DUAL no pesa nada.
    const sinPeso = mapLadyleeProduct(
      { ...JENGA, variants: [{ ...JENGA.variants[0], grams: 0 }] },
      CONFIG,
      'HNL',
    )!;
    expect(sinPeso.weight_grams).toBeNull();
  });

  test('no inventa codigo de barras', () => {
    // products.json no lo trae. Dejarlo en null es correcto; rellenarlo con el
    // sku daria un GTIN falso que emparejaria productos distintos entre tiendas.
    expect(jenga.barcode_raw ?? null).toBeNull();
    expect(jenga.gtin ?? null).toBeNull();
  });

  test('toma la categoria de la coleccion recorrida', () => {
    expect(jenga.store_category_external_id).toBe('juguetes');
    expect(jenga.category_raw).toBe('JUGUETES');
    // product_type es un codigo interno sin nombre legible: va como atributo.
    expect(jenga.attributes?.productType).toBe('LL0308');
  });

  test('deja la categoria en null cuando se leyo desde /collections/all', () => {
    const sinCategoria = mapLadyleeProduct(JENGA, CONFIG, 'HNL')!;
    expect(sinCategoria.store_category_external_id).toBeNull();
    expect(sinCategoria.category_raw).toBeNull();
  });

  test('mapea las imagenes con su posicion', () => {
    expect(jenga.images).toHaveLength(1);
    expect(jenga.images![0].is_primary).toBe(true);
    expect(jenga.images![0].width).toBe(515);
    expect(jenga.primary_image_url).toBe(JENGA.images[0].src);
  });

  test('traduce la disponibilidad sin inventar cantidades', () => {
    // Shopify solo publica el booleano `available` en products.json.
    expect(jenga.in_stock).toBe(true);
    expect(jenga.availability).toBe('in_stock');
    expect(jenga.stock_quantity ?? null).toBeNull();
  });

  test('marca como agotado el articulo sin stock', () => {
    const agotado = mapLadyleeProduct(
      { ...JENGA, variants: [{ ...JENGA.variants[0], available: false }] },
      CONFIG,
      'HNL',
    )!;
    expect(agotado.in_stock).toBe(false);
    expect(agotado.availability).toBe('out_of_stock');
    expect(agotado.badges).toContain('agotado');
  });

  test('omite la variante "Default Title" que Shopify inventa', () => {
    // Todo el catalogo de Ladylee es de variante unica: emitirla generaria una
    // fila vacia por producto sin aportar ningun dato.
    expect(jenga.variants).toEqual([]);
  });

  test('guarda el payload completo en raw', () => {
    expect(jenga.raw?.id).toBe(JENGA.id);
    expect(jenga.raw?.updated_at).toBe(JENGA.updated_at);
  });

  test('limpia la descripcion pero conserva el html en raw', () => {
    expect(jenga.description).not.toContain('<div');
    expect(jenga.short_description!.length).toBeLessThanOrEqual(300);
    expect(String(jenga.raw?.body_html)).toContain('<div');
  });

  test('descarta articulos sin id, sin nombre o sin handle', () => {
    expect(mapLadyleeProduct({ ...JENGA, id: 0 as unknown as number }, CONFIG, 'HNL')).toBeNull();
    expect(mapLadyleeProduct({ ...JENGA, title: '' }, CONFIG, 'HNL')).toBeNull();
    expect(mapLadyleeProduct({ ...JENGA, handle: '' }, CONFIG, 'HNL')).toBeNull();
  });
});

describe('mapLadyleeProduct con varias variantes', () => {
  /**
   * Fixture SINTETICO, a proposito: hoy Ladylee no publica ningun articulo con
   * mas de una variante (comprobado sobre juguetes, celulares, muebles, hogar,
   * temporada y linea blanca). Se prueba igual porque el dia que activen
   * tallas o colores en Shopify el mapeo tiene que aguantar sin tocarse.
   */
  const MULTI = {
    ...JENGA,
    id: 999,
    handle: 'articulo-con-tallas',
    options: [{ name: 'Talla', position: 1, values: ['S', 'M'] }],
    variants: [
      { id: 1, title: 'S', option1: 'S', sku: 'A-S', available: false, price: '150.00', compare_at_price: '200.00', grams: 100 },
      { id: 2, title: 'M', option1: 'M', sku: 'A-M', available: true, price: '180.00', compare_at_price: '180.00', grams: 100 },
    ],
  };

  const multi = mapLadyleeProduct(MULTI, CONFIG, 'HNL')!;

  test('el precio de portada es el mas bajo y expone el rango', () => {
    expect(multi.price).toBe(150);
    expect(multi.min_price).toBe(150);
    expect(multi.max_price).toBe(180);
  });

  test('hay stock si al menos una variante lo tiene', () => {
    expect(multi.in_stock).toBe(true);
  });

  test('emite cada variante con su opcion legible', () => {
    expect(multi.variants).toHaveLength(2);
    expect(multi.variants![0]).toMatchObject({
      external_id: '1',
      sku: 'A-S',
      price: 150,
      list_price: 200,
      in_stock: false,
      availability: 'out_of_stock',
      options: { Talla: 'S' },
    });
    // La segunda repite el precio en compare_at: tampoco ahi hay descuento.
    expect(multi.variants![1].list_price).toBeNull();
  });
});

describe('ladyleeStrategy', () => {
  test('se declara con la clave y los tipos de target esperados', () => {
    expect(ladyleeStrategy.key).toBe('ladylee');
    expect(ladyleeStrategy.supports).toEqual(['full_catalog', 'category']);
  });
});
