import { describe, expect, test } from 'vitest';
import {
  mapPaperdepotCard,
  paperdepotGrid,
  paperdepotImageFile,
  paperdepotText,
  parsePaperdepotCards,
  parsePaperdepotLastPage,
  parsePaperdepotNav,
  parsePaperdepotOfferCards,
  parsePaperdepotPrice,
} from './paperdepot';

const WEB = 'https://www.paperdepothn.com';
const OPTIONS = { webBaseUrl: WEB, currency: 'HNL' };

/** Recorte real de https://www.paperdepothn.com/grupo/166?page=1 (2026-09-19). */
const LISTING = `
  <div class="container-fluid">
    <div class="category-header-container"><h1>ESCOLARES<SPAN> Y </SPAN>ARQUITECTURA</h1></div>
    <div class="section-header"><h4>BOLIGRAFOS<SPAN> Y </SPAN>LÁPICES</h4></div>
    <div class="products-grid">
      <div class="product-card-related">
        <a href="/producto/030172" class="product-link">
          <div class="product-image-wrapper">
            <img src="/thumbs.php?file=030172x.jpg" onerror="this.src='/images/imagen.svg'"
              alt="Lapiz Grafito Lyra Robinson Hb/2">
          </div>
          <div class="product-card-body">
            <span class="product-code">Código: 030172</span>
            <h4 class="product-name">Lapiz Grafito Lyra Robinson Hb/2</h4>
            <div class="product-price-related">
              L. 3.89              </div>
            <div class="view-product-btn"><i class="fas fa-eye"></i> Ver Producto</div>
          </div>
        </a>
      </div>
      <div class="product-card-related">
        <a href="/producto/06050" class="product-link">
          <div class="product-image-wrapper">
            <img src="/thumbs.php?file=06050.jpg" alt="Cuaderno Mead 150Hjs 3M. Poly C/Bolsillo">
          </div>
          <div class="product-card-body">
            <span class="product-code">Código: 06050</span>
            <h4 class="product-name">Cuaderno Mead 150Hjs 3M. Poly C/Bolsillo</h4>
            <div class="product-price-related">
              L. 1,164.28              </div>
          </div>
        </a>
      </div>
    </div>
  </div>
  <nav data-pagination>
    <a href="/grupo/Array?page=1" disabled>«</a>
    <ul>
      <li class="current"><a href="/grupo/Array?page=1"> 1 </a></li>
      <li><a href="/grupo/Array?page=2"> 2 </a></li>
      <li><a href="/grupo/Array?page=10"> 10 </a></li>
      <li><a href="/grupo/Array?page=2" aria-label="Next">»</a></li>
    </ul>
  </nav>
  <!-- La tira de recomendados va FUERA del grid y no es del grupo -->
  <div class="related-strip">
    <div class="product-card-related">
      <a href="/producto/NO-ES-DEL-GRUPO" class="product-link">
        <div class="product-image-wrapper"><img src="/thumbs.php?file=x.jpg" alt="x"></div>
        <div class="product-card-body">
          <h4 class="product-name">Ajeno</h4>
          <div class="product-price-related">L. 1.00</div>
        </div>
      </a>
    </div>
  </div>
`;

/** Recorte real de https://www.paperdepothn.com/ofertas?page=1 (2026-09-19). */
const OFFERS = `
  <div class="products-grid">
    <div class="product-card-ofertas">
      <div class="product-image-container">
        <div class="discount-badge">-45%</div>
        <a href="/producto/06050">
          <img src="/media/image.php?file=06050.jpg" alt="Cuaderno Mead 150Hjs 3M. Poly C/Bolsillo">
        </a>
      </div>
      <div class="product-details">
        <p class="product-code">Código: 06050</p>
        <h3 class="product-name">
          <a href="/producto/06050">Cuaderno Mead 150Hjs 3M. Poly C/Bolsillo</a>
        </h3>
        <div class="product-price-section">
          <div class="price-container">
            <span class="original-price">L. 164.28</span>
            <span class="discount-price">L. 89.68</span>
          </div>
          <p class="savings-text">¡Ahorras L. 74.60!</p>
        </div>
      </div>
    </div>
    <div class="product-card-ofertas">
      <div class="product-image-container">
        <a href="/producto/SIN-REBAJA"><img src="/media/image.php?file=y.jpg" alt="y"></a>
      </div>
      <div class="product-details">
        <p class="product-code">Código: SIN-REBAJA</p>
        <h3 class="product-name"><a href="/producto/SIN-REBAJA">Repite el precio</a></h3>
        <div class="product-price-section">
          <div class="price-container">
            <span class="original-price">L. 50.00</span>
            <span class="discount-price">L. 50.00</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <nav data-pagination><ul><li><a href="/ofertas?page=96"> 96 </a></li></ul></nav>
`;

/** Recorte real del menu de la portada. */
const NAV = `
  <li class="cats-list-item" data-cat-id="ES">
    <span class="cat-name">Escolares<Span> y </Span>Arquitectura</span>
  </li>
  <li class="cats-list-item" data-cat-id="OFI"><span class="cat-name">Oficina</span></li>
  <div class="groups-content">
    <div class="groups-panel" data-cat-content="ES">
      <a href="/grupo/166" class="group-item"><span class="group-name">Boligrafos<Span> y </Span>Lápices</span></a>
      <a href="/grupo/178" class="group-item"><span class="group-name">Cuadernos</span></a>
    </div>
    <div class="groups-panel" data-cat-content="OFI">
      <a href="/grupo/131" class="group-item"><span class="group-name">Utiles,Oficina y Papeleria</span></a>
    </div>
  </div>
`;

describe('paperdepot / parseo', () => {
  test('limpia entidades, etiquetas y comillas escapadas', () => {
    expect(paperdepotText('Paq. 2 Cojines 16\\" Rojos')).toBe('Paq. 2 Cojines 16" Rojos');
    expect(paperdepotText('Mac&amp;Pc')).toBe('Mac&Pc');
    expect(paperdepotText('ESCOLARES<SPAN> Y </SPAN>ARQUITECTURA')).toBe('ESCOLARES Y ARQUITECTURA');
  });

  test('precios con separador de miles', () => {
    expect(parsePaperdepotPrice('L. 1,164.28')).toBe(1164.28);
    expect(parsePaperdepotPrice('L. 3.89')).toBe(3.89);
    expect(parsePaperdepotPrice('  ')).toBeNull();
    expect(parsePaperdepotPrice(null)).toBeNull();
  });

  test('saca el nombre del archivo de la imagen', () => {
    expect(paperdepotImageFile('/thumbs.php?file=030172x.jpg')).toBe('030172x.jpg');
    expect(paperdepotImageFile('/media/image.php?file=06050.jpg')).toBe('06050.jpg');
    expect(paperdepotImageFile('/images/imagen.svg')).toBeNull();
  });

  test('el recorte al grid deja fuera la tira de recomendados', () => {
    expect(paperdepotGrid(LISTING)).not.toContain('NO-ES-DEL-GRUPO');
    // Un grupo vacio o inexistente no tiene grid con tarjetas.
    expect(parsePaperdepotCards('<div class="otra-cosa"></div>')).toEqual([]);
  });

  test('tarjetas del listado', () => {
    const cards = parsePaperdepotCards(LISTING);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      code: '030172',
      name: 'Lapiz Grafito Lyra Robinson Hb/2',
      imageFile: '030172x.jpg',
      price: 3.89,
      listPrice: null,
      discountPercent: null,
    });
    // El listado publica el precio de lista aunque el articulo este rebajado.
    expect(cards[1]).toMatchObject({ code: '06050', price: 1164.28, listPrice: null });
  });

  test('ultima pagina del paginador, con los href rotos que sirve el sitio', () => {
    expect(parsePaperdepotLastPage(LISTING)).toBe(10);
    expect(parsePaperdepotLastPage(OFFERS)).toBe(96);
    expect(parsePaperdepotLastPage('<div>sin paginador</div>')).toBe(1);
  });

  test('tarjetas de /ofertas con precio antes y despues', () => {
    const cards = parsePaperdepotOfferCards(OFFERS);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      code: '06050',
      name: 'Cuaderno Mead 150Hjs 3M. Poly C/Bolsillo',
      imageFile: '06050.jpg',
      price: 89.68,
      listPrice: 164.28,
      discountPercent: 45,
    });
    // Si el "antes" repite el precio no hay rebaja real.
    expect(cards[1]).toMatchObject({ code: 'SIN-REBAJA', price: 50, listPrice: null });
  });

  test('menu de categorias y grupos', () => {
    const nav = parsePaperdepotNav(NAV);
    expect(nav).toEqual([
      {
        id: 'ES',
        name: 'Escolares y Arquitectura',
        groups: [
          { id: '166', name: 'Boligrafos y Lápices' },
          { id: '178', name: 'Cuadernos' },
        ],
      },
      { id: 'OFI', name: 'Oficina', groups: [{ id: '131', name: 'Utiles,Oficina y Papeleria' }] },
    ]);
  });
});

describe('paperdepot / mapeo', () => {
  const [lapiz] = parsePaperdepotCards(LISTING);
  const grupo = { id: '166', name: 'Boligrafos y Lápices' };

  test('articulo sin rebaja', () => {
    const mapped = mapPaperdepotCard(lapiz, OPTIONS, grupo, 'Escolares y Arquitectura');
    expect(mapped).toMatchObject({
      external_id: '030172',
      sku: '030172',
      name: 'Lapiz Grafito Lyra Robinson Hb/2',
      url: 'https://www.paperdepothn.com/producto/030172',
      // La del listado (/thumbs.php) devuelve html; la buena es /media/image.php.
      primary_image_url: 'https://www.paperdepothn.com/media/image.php?file=030172x.jpg',
      price: 3.89,
      list_price: null,
      currency: 'HNL',
      // El sitio publica "L. 3.89 + ISV".
      tax_included: false,
      tax_rate: 15,
      store_category_external_id: '166',
      category_raw: 'Boligrafos y Lápices',
      category_path: ['Escolares y Arquitectura', 'Boligrafos y Lápices'],
      badges: [],
    });
    expect(mapped?.attributes).toEqual({ price_with_tax: 4.47 });
  });

  test('articulo rebajado: manda el precio de /ofertas', () => {
    const [oferta] = parsePaperdepotOfferCards(OFFERS);
    const mapped = mapPaperdepotCard(oferta, OPTIONS, grupo, 'Escolares y Arquitectura');
    expect(mapped).toMatchObject({
      external_id: '06050',
      price: 89.68,
      list_price: 164.28,
      discount_amount: 74.6,
      discount_percent: 45,
      badges: ['oferta'],
    });
  });

  test('grupo sin nombre (los que no cuelgan del menu): sin categoria inventada', () => {
    const mapped = mapPaperdepotCard(lapiz, OPTIONS, null, null);
    expect(mapped?.store_category_external_id).toBeNull();
    expect(mapped?.category_raw).toBeNull();
    expect(mapped?.category_path).toEqual([]);
  });

  test('descarta lo que no se puede publicar', () => {
    expect(mapPaperdepotCard({ ...lapiz, code: '' }, OPTIONS)).toBeNull();
    expect(mapPaperdepotCard({ ...lapiz, name: '' }, OPTIONS)).toBeNull();
    expect(mapPaperdepotCard({ ...lapiz, price: null }, OPTIONS)).toBeNull();
    expect(mapPaperdepotCard({ ...lapiz, price: 0 }, OPTIONS)).toBeNull();
  });
});
