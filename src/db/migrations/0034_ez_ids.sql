-- =============================================================================
-- 0034_ez_ids.sql
-- Identificador corto (`ez_id`) en `stores`, `categories` y `store_categories`.
--
-- Por qué. Las llaves primarias son `uuid` y eso está bien para la máquina,
-- pero son imposibles de dictar, recordar o escribir a mano: "la categoría
-- 3f9c1a2e-…" no le sirve a nadie que esté revisando el panel, hablando con
-- otra persona o escribiendo un filtro en el SQL Editor. Estas tres tablas
-- son las que una persona manipula a mano con más frecuencia (dar de alta
-- una tienda, mapear una categoría de tienda al árbol canónico), así que
-- reciben un entero secuencial, único y legible: "la 42".
--
-- Qué NO es. `ez_id` no reemplaza a `id`: todas las foreign keys, el código
-- y las URLs siguen usando el `uuid`. Es una etiqueta humana, nada más. No se
-- agrega a `products` ni a `store_products` a propósito: son decenas de miles
-- de filas que nadie referencia a mano, y ahí la secuencia solo sumaría ruido.
--
-- Cómo se llena. `serial` crea una secuencia por tabla y, al agregar la
-- columna, Postgres numera las filas ya existentes en el orden físico en que
-- las lee. Las filas nuevas toman el siguiente valor. La secuencia queda
-- cubierta por los `alter default privileges` de 0010, así que `service_role`
-- puede insertar sin un grant extra.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

alter table find_your_prices.stores
  add column if not exists ez_id serial unique;

alter table find_your_prices.categories
  add column if not exists ez_id serial unique;

alter table find_your_prices.store_categories
  add column if not exists ez_id serial unique;
