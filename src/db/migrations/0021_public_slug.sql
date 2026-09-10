-- =============================================================================
-- 0021_public_slug.sql
-- Una direccion legible para cada ficha: /p/secadora-de-pelo-dyson-supersonic
-- en vez de /producto/000131e8-c1ee-4dc6-af8f-b13bbc086416.
--
-- Por que no es cosmetico: la URL es uno de los pocos textos que Google lee
-- antes de entrar a la pagina, y es lo que se ve en el resultado de busqueda,
-- en el enlace pegado en WhatsApp y en la barra del navegador. Un uuid no dice
-- nada en ninguno de los tres sitios. Con decenas de miles de fichas y el trafico
-- de busqueda como unica puerta de entrada, esa diferencia se multiplica por
-- todo el catalogo.
--
-- El slug NO se recalcula cuando la tienda cambia el nombre del articulo. Una
-- URL que cambia sola es un enlace roto para todo el que la habia guardado y
-- una pagina que Google tiene que volver a descubrir desde cero. El nombre
-- puede envejecer un poco; la direccion tiene que ser estable.
-- =============================================================================

alter table find_your_prices.store_products
  add column if not exists public_slug text;

comment on column find_your_prices.store_products.public_slug is
  'Segmento de URL publica de la ficha (/p/<public_slug>). Unico y estable: se asigna una vez y no sigue los cambios de nombre.';

-- -----------------------------------------------------------------------------
-- La parte legible del slug, sin desambiguar.
--
-- El corte a 80 caracteres es por lo que publican las tiendas: nombres como
-- "Refrigeradora Whirlpool 14 pies French Door acero inoxidable con dispensador
-- de agua y hielo" pasan de 100 caracteres, y una URL asi se corta en el
-- resultado de busqueda justo donde deja de leerse. Se recorta DESPUES de
-- slugificar y se vuelve a limpiar el guion del borde, porque el corte puede
-- caer en medio de una palabra y dejarlo colgando.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.product_slug_base(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(
    nullif(trim(both '-' from left(coalesce(find_your_prices.slugify(p_name), ''), 80)), ''),
    'producto'
  );
$$;

-- -----------------------------------------------------------------------------
-- El slug definitivo, ya libre.
--
-- Los choques son inevitables y frecuentes, no un caso raro: el mismo televisor
-- lo venden Diunsa y Walmart con el mismo nombre, y una tienda publica el mismo
-- articulo en dos presentaciones. El desempate es un sufijo numerico
-- (-2, -3, ...) y no el uuid recortado a propósito: "televisor-tcl-55-2" se
-- sigue leyendo, "televisor-tcl-55-a3f19c" no.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.next_public_slug(p_name text, p_id uuid)
returns text
language plpgsql
as $$
declare
  base      text;
  candidate text;
  n         int := 1;
begin
  base := find_your_prices.product_slug_base(p_name);
  candidate := base;

  loop
    exit when not exists (
      select 1
      from find_your_prices.store_products
      where public_slug = candidate
        and id is distinct from p_id
    );
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  return candidate;
end;
$$;

-- El indice unico es lo que hace que el bucle de arriba sea una optimizacion y
-- no la unica defensa: dos ingestas simultaneas pueden elegir el mismo
-- candidato, y la que pierda tiene que fallar en vez de duplicar la URL.
create unique index if not exists store_products_public_slug_key
  on find_your_prices.store_products (public_slug);

-- -----------------------------------------------------------------------------
-- Asignacion automatica.
--
-- Solo actua cuando no hay slug. En el UPDATE eso significa "nunca", salvo para
-- las filas que se hayan quedado sin backfill: cambiar el nombre del articulo
-- NO cambia su direccion, que es justo lo que se quiere.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.tg_store_products_public_slug()
returns trigger
language plpgsql
as $$
begin
  if new.public_slug is null or new.public_slug = '' then
    new.public_slug := find_your_prices.next_public_slug(new.name, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists store_products_public_slug on find_your_prices.store_products;

create trigger store_products_public_slug
  before insert or update of name on find_your_prices.store_products
  for each row
  execute function find_your_prices.tg_store_products_public_slug();

-- -----------------------------------------------------------------------------
-- Backfill del catalogo que ya existe.
--
-- Fila por fila y no en un solo UPDATE con row_number(): la numeracion en bloque
-- puede generar "iphone-17-2" para un articulo mientras otro se llama de verdad
-- "iPhone 17 2" y reclama ese mismo slug, y el indice unico rechazaria la
-- sentencia entera dejando el catalogo a medias. El bucle consulta el estado
-- real en cada paso, asi que converge siempre.
--
-- Se repite hasta que no queden filas sin slug para que sea reejecutable: si la
-- migracion se corta a la mitad, volver a lanzarla termina el trabajo en vez de
-- empezarlo de nuevo.
-- -----------------------------------------------------------------------------
do $$
declare
  r      record;
  moved  int;
begin
  loop
    moved := 0;

    for r in
      select id, name
      from find_your_prices.store_products
      where public_slug is null
      limit 2000
    loop
      update find_your_prices.store_products
        set public_slug = find_your_prices.next_public_slug(r.name, r.id)
      where id = r.id;
      moved := moved + 1;
    end loop;

    exit when moved = 0;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Publicar la columna en la vista del catalogo.
--
-- Al final de la lista, como en 0017: `create or replace view` solo admite
-- columnas nuevas al final, y asi la vista se reemplaza sin soltar las vistas de
-- facetas ni los grants que cuelgan de ella.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_store_products_current as
select
  sp.id,
  sp.store_id,
  s.slug            as store_slug,
  s.name            as store_name,
  s.logo_url        as store_logo_url,
  sp.product_id,
  sp.external_id,
  sp.name,
  sp.url,
  sp.primary_image_url,
  coalesce(b.name, sp.brand_raw) as brand,
  sp.category_raw,
  sc.name           as store_category_name,
  c.slug            as category_slug,
  sp.currency,
  sp.price,
  sp.list_price,
  sp.discount_percent,
  sp.member_price,
  sp.availability,
  sp.in_stock,
  sp.stock_quantity,
  sp.rating_average,
  sp.rating_count,
  sp.gtin,
  sp.last_seen_at,
  sp.last_price_change_at,
  sp.first_seen_at,
  sp.public_slug
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
where sp.is_active and s.is_active;

comment on view find_your_prices.v_store_products_current is 'Oferta activa con tienda, marca y categoria resueltas. Base del catalogo publico.';
