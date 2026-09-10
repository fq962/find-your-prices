import type { JsonLdNode } from "./schema";

/**
 * Emite un bloque de datos estructurados.
 *
 * Va con `dangerouslySetInnerHTML` porque un `<script>` en React sólo acepta
 * contenido como cadena; no hay entrada de usuario aquí —el contenido lo arma
 * `schema.ts` a partir de la base—, pero igual se escapa `<` para cerrar la
 * única vía por la que el nombre de un producto scrapeado podría terminar la
 * etiqueta antes de tiempo y meter marcado en la página. Una tienda que
 * publique un producto llamado `</script><script>…` no debe poder ejecutarlo
 * en nuestro dominio.
 */
export function JsonLd({ data }: { data: JsonLdNode }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
