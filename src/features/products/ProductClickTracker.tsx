"use client";

import { useEffect } from "react";

/** A dónde se manda cada clic. `sendBeacon` no espera respuesta. */
const CLICK_ENDPOINT = "/api/products/click";

/** Solo uuids: cualquier otra cosa en el atributo se ignora sin pedir nada. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cuenta los clics a productos, por delegación desde el documento.
 *
 * Cualquier enlace con `data-product-id` cuenta: la tarjeta de la lista, la
 * ficha en la retícula y el botón "ver en la tienda" del detalle. Es un solo
 * listener para toda la página en lugar de un `onClick` por tarjeta —con
 * cientos de artículos en pantalla la diferencia se nota— y no toca la
 * navegación: `sendBeacon` sale aunque la página se descargue justo después,
 * que es exactamente lo que pasa al ir a la tienda.
 *
 * Lo que alimenta: `store_products.click_count`, de donde salen los
 * "productos populares" de cada categoría (migración 0031).
 */
export function ProductClickTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLElement>("[data-product-id]");
      const id = link?.dataset.productId;
      if (!id || !UUID_PATTERN.test(id)) return;

      const body = JSON.stringify({ id });
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(CLICK_ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(CLICK_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };

    document.addEventListener("click", onClick, { passive: true });
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
