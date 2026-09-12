import { describe, expect, test } from 'vitest';
import { categorySlugFromUrl, mapGamestationCard, parseCards, parseLastPage, parseTotal } from './gamestation';

/** Fragmento real de https://gamestation.hn/product-category/switch/ (2026-09-12). */
const HTML = `Showing 1&ndash;12 of 1435 results
<li class="product"></li><li class="list-view-item"></li><li class="post-26141 product type-product status-publish has-post-thumbnail product_cat-switch product_cat-switch-2-video-juegos first instock taxable shipping-taxable purchasable product-type-simple">
<a href="https://gamestation.hn/product/switch-2-star-fox-game/" class="woocommerce-LoopProduct-link woocommerce-loop-product__link"><img width="247" height="300" src="//gamestation.hn/wp-content/uploads/2026/06/NS2-Star-Fox-game-247x300.jpeg" class="attachment-shop_catalog size-shop_catalog wp-post-image" alt="" loading="lazy" /><h2 class="woocommerce-loop-product__title">Switch 2 Star Fox</h2>
<span class="price"><span class="woocommerce-Price-amount amount"><span class="woocommerce-Price-currencySymbol">L</span>1,690.00</span></span>
</a></li><li class="list-view-item"><span class="precio">1690 <span>HNL</span></span></li><li class="post-1 product outofstock product_cat-xbox">
<a href="https://gamestation.hn/product/oferta/"><h2 class="woocommerce-loop-product__title">Oferta &amp; Co</h2>
<span class="price"><del><span class="amount"><span>L</span>2,000.00</span></del> <ins><span class="amount"><span>L</span>1,500.00</span></ins></span>
</a></li>
<a href="https://gamestation.hn/product-category/switch/page/120/">120</a>`;

describe('gamestation', () => {
  const cards = parseCards(HTML);

  test('parsea total y ultima pagina', () => {
    expect(parseTotal(HTML)).toBe(1435);
    expect(parseLastPage(HTML)).toBe(120);
  });

  test('extrae la tarjeta real', () => {
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      id: '26141',
      url: 'https://gamestation.hn/product/switch-2-star-fox-game/',
      name: 'Switch 2 Star Fox',
      imageUrl: 'https://gamestation.hn/wp-content/uploads/2026/06/NS2-Star-Fox-game-247x300.jpeg',
      price: 1690,
      listPrice: null,
      inStock: true,
      categorySlugs: ['switch', 'switch-2-video-juegos'],
    });
  });

  test('rebaja con del/ins y agotado', () => {
    expect(cards[1]).toMatchObject({ name: 'Oferta & Co', price: 1500, listPrice: 2000, inStock: false });
  });

  test('mapea sin raw', () => {
    const p = mapGamestationCard(cards[0], 'HNL', 'switch');
    expect(p.external_id).toBe('26141');
    expect(p.category_raw).toBe('Nintendo');
    expect(p.raw).toBeUndefined();
    expect(p.availability).toBe('in_stock');
  });

  test('slug desde url', () => {
    expect(categorySlugFromUrl('https://gamestation.hn/product-category/play4/')).toBe('play4');
  });
});
