import type { AvailabilityStatus } from "@/server/scraping/types";
import type { ProductDetail } from "@/server/services/catalog";

/**
 * Etiquetas Open Graph propias de un producto.
 *
 * Existen aparte de `generateMetadata` por una limitación concreta de Next: su
 * vocabulario de Open Graph sólo admite los tipos que él sabe emitir
 * —`website`, `article`, `book`…— y `product` no está en la lista; pasárselo
 * lanza un error en el build. Y `metadata.other`, que sería la vía de escape,
 * emite `<meta name>` en vez de `<meta property>`, que es lo que exige el
 * protocolo y lo que los rastreadores de Facebook y WhatsApp leen de verdad.
 *
 * Así que se emiten como elementos. React 19 iza los `<meta>` que encuentra en
 * cualquier parte del árbol hasta el `<head>`, que es exactamente lo que hace
 * falta acá.
 *
 * Para qué sirven: con `og:type=product` y `product:price:amount`, un enlace
 * pegado en WhatsApp muestra el precio dentro de la vista previa. Sin ellas
 * muestra sólo título y foto — y en un comparador el precio ES el titular.
 */

/** Vocabulario de disponibilidad de Facebook. No es el de schema.org. */
const OG_AVAILABILITY: Record<AvailabilityStatus, string | undefined> = {
  in_stock: "in stock",
  limited: "limited availability",
  out_of_stock: "out of stock",
  preorder: "preorder",
  backorder: "backorder",
  discontinued: "discontinued",
  // Sin existencia determinada no se emite la etiqueta: una vista previa que
  // afirma "in stock" sobre un dato que no tenemos es peor que una sin el dato.
  unknown: undefined,
};

function ogCondition(condition?: string): string {
  switch (condition?.toLowerCase()) {
    case "used":
    case "usado":
      return "used";
    case "refurbished":
    case "reacondicionado":
      return "refurbished";
    default:
      return "new";
  }
}

export function ProductOgTags({ product }: { product: ProductDetail }) {
  return (
    <>
      <meta property="og:type" content="product" />
      {product.price > 0 && (
        <>
          <meta property="product:price:amount" content={product.price.toFixed(2)} />
          <meta property="product:price:currency" content={product.currency} />
        </>
      )}
      {/* El precio de lista sólo se declara cuando hay rebaja de verdad: si es
          igual al precio actual, anunciar un "antes" es inventar un descuento. */}
      {product.listPrice !== undefined && product.listPrice > product.price && (
        <>
          <meta property="product:original_price:amount" content={product.listPrice.toFixed(2)} />
          <meta property="product:original_price:currency" content={product.currency} />
        </>
      )}
      {OG_AVAILABILITY[product.availabilityStatus] && (
        <meta
          property="product:availability"
          content={OG_AVAILABILITY[product.availabilityStatus]}
        />
      )}
      <meta property="product:condition" content={ogCondition(product.condition)} />
      {product.brand && <meta property="product:brand" content={product.brand} />}
      {product.sku && <meta property="product:retailer_item_id" content={product.sku} />}
    </>
  );
}
