-- =============================================================================
-- 0046_weekly_scrape_schedule.sql
-- Agenda semanal del cron: cada target tiene su hora fija, maximo 2 por hora.
--
-- COMO FUNCIONA
--
-- El cron dispara UNA vez por hora, en punto (hora de Honduras):
--
--   0 * * * *   GET /api/scraping/run?secret=...&limit=2&timeBudgetMs=270000
--
-- y cada tanda atiende solo lo que vencio. Esta migracion reparte los 118
-- targets activos en las 168 horas de la semana usando el mecanismo de
-- 0023_schedule_anchor (ancla + intervalo):
--
--   * 10080 min (1 semana)  -> corre una vez por semana, mismo dia y hora.
--   *  5040 min (3.5 dias)  -> corre dos veces por semana: el dia/hora del
--     ancla y 84 h despues (p.ej. lunes 00:00 y jueves 12:00). Lo usan las
--     tiendas cuyos precios se mueven mas: supermercados y farmacias
--     (walmarthn, paiz, pricesmart, comisariato-los-andes, kielsa,
--     farmaciasiman).
--
-- Reglas con las que se armo (duracion = maximo medido en scrape_runs x 1.15):
--   * Nunca mas de 2 targets en la misma hora, y nunca 2 de la misma tienda.
--   * Dos targets comparten hora solo si juntos estiman <= 225 s (el
--     presupuesto de la tanda es 270 s; el resto es para la bitacora y el
--     refresco de mv_catalog).
--   * Los pesados (> 112 s) van solos y, los semanales, de madrugada
--     (22:00-06:00), cuando las tiendas tienen menos trafico.
--
-- El ancla va a las HH:55 de la hora anterior (ver README: evita la carrera
-- con un cron que dispara un par de segundos antes de la hora). La semana base
-- es la del lunes 2026-10-05; el ancla puede quedar en el pasado, lo que
-- importa es la rejilla.
--
-- `limit=2` en la URL es la garantia dura del "maximo 2 por hora": aunque un
-- reintento por fallo (backoff del runner) deje un tercer target vencido, la
-- tanda no atiende mas de dos y el resto pasa a la hora siguiente.
--
-- El calendario legible esta en src/db/docs/scrape-schedule.md.
-- Idempotente: se puede volver a ejecutar; recalcula next_run_at desde now().
-- =============================================================================

begin;

with plan(target_id, anchor_local, frequency_minutes) as (
  values
  ('9bc25cd1-47b5-4e98-b915-27b53d8e135c'::uuid, timestamp '2026-10-04 23:55', 10080),  -- Lunes 00:00 · acosa · ACOSA - Catalogo completo
  ('99e29369-07cc-47aa-a992-6986d739725b'::uuid, timestamp '2026-10-05 00:55', 10080),  -- Lunes 01:00 · zara · Zara - Ninos
  ('e9e64e49-1f3c-4c53-994b-fbe10f50d6a7'::uuid, timestamp '2026-10-05 01:55', 10080),  -- Lunes 02:00 · metromedia · Metromedia - Libros en Espanol
  ('0cdb4510-1b06-4307-857f-edc422b53f0a'::uuid, timestamp '2026-10-05 02:55', 10080),  -- Lunes 03:00 · ladylee · Ladylee - Catalogo completo
  ('4347e10e-4de6-490a-8f45-6720bd58720d'::uuid, timestamp '2026-10-05 03:55', 10080),  -- Lunes 04:00 · paperdepot · Catalogo completo
  ('14e519a4-509f-4e73-9670-97c22d12fdae'::uuid, timestamp '2026-10-05 04:55', 10080),  -- Lunes 05:00 · officedepot · Catalogo completo
  ('0ef6b6f1-2a0d-4ea2-b008-33d38f4668af'::uuid, timestamp '2026-10-05 05:55', 10080),  -- Lunes 06:00 · diunsa · Diunsa - Catalogo completo
  ('03ce887d-f797-4e5b-ad6f-a2b85087f9e3'::uuid, timestamp '2026-10-05 06:55', 5040),  -- Lunes 07:00 + Jueves 19:00 · paiz · Paiz · Abarrotes
  ('44c8c292-47b9-46db-bae0-4527311626e7'::uuid, timestamp '2026-10-05 07:55', 5040),  -- Lunes 08:00 + Jueves 20:00 · pricesmart · PriceSmart HN - Catalogo completo
  ('b226af33-b01b-4310-84e9-422bd0ef5733'::uuid, timestamp '2026-10-05 08:55', 5040),  -- Lunes 09:00 + Jueves 21:00 · kielsa · Kielsa - Catalogo completo
  ('eba198c4-bc11-492f-836a-57d838b7c65e'::uuid, timestamp '2026-10-05 09:55', 5040),  -- Lunes 10:00 + Jueves 22:00 · farmaciasiman · Catalogo completo
  ('3086de42-0f8e-444e-9a78-7183a9f79795'::uuid, timestamp '2026-10-05 10:55', 5040),  -- Lunes 11:00 + Jueves 23:00 · walmarthn · Walmart HN - Higiene y Belleza
  ('d2c2ac2f-b632-4e4c-bd02-1bab22d9eb9c'::uuid, timestamp '2026-10-05 11:55', 5040),  -- Lunes 12:00 + Viernes 00:00 · walmarthn · Walmart HN - Hogar / Ferreteria
  ('dbb5609f-d61f-4f8f-bc47-6a5822f2b05b'::uuid, timestamp '2026-10-05 11:55', 10080),  -- Lunes 12:00 · larach · Larach - Construcción
  ('615e5edf-1df7-43e9-af42-67f8a87f3e22'::uuid, timestamp '2026-10-05 12:55', 5040),  -- Lunes 13:00 + Viernes 01:00 · walmarthn · Walmart HN - Hogar / Pintura
  ('2a53449e-7d43-43db-9d01-c74fe7b0698a'::uuid, timestamp '2026-10-05 12:55', 10080),  -- Lunes 13:00 · metromedia · Metromedia - Entretenimiento
  ('3f163b9d-380f-4f99-a6c1-2fb48248362b'::uuid, timestamp '2026-10-05 13:55', 5040),  -- Lunes 14:00 + Viernes 02:00 · paiz · Paiz · Autos
  ('8d74a737-f6b6-405d-a9a5-67d889b9756f'::uuid, timestamp '2026-10-05 13:55', 10080),  -- Lunes 14:00 · larach · Larach - Automotriz
  ('6faf622e-57c9-40e7-9d9f-d8f69645e4fc'::uuid, timestamp '2026-10-05 14:55', 5040),  -- Lunes 15:00 + Viernes 03:00 · paiz · Paiz · Juguetes · Vehículos, Pistas y Control Remoto
  ('44af606e-a250-4335-a9e2-60d875455027'::uuid, timestamp '2026-10-05 14:55', 10080),  -- Lunes 15:00 · radioshack-hn · RadioShack HN - Audifonos
  ('bb291983-4885-4852-be26-ef928428041e'::uuid, timestamp '2026-10-05 15:55', 5040),  -- Lunes 16:00 + Viernes 04:00 · walmarthn · Walmart HN - Hogar / Libros y Revistas
  ('11705b9e-58e5-4d1f-bdba-5038bf18e132'::uuid, timestamp '2026-10-05 15:55', 10080),  -- Lunes 16:00 · larach · Larach - Lámparas
  ('c0fca063-b162-4084-84db-b7a0dbf62993'::uuid, timestamp '2026-10-05 16:55', 5040),  -- Lunes 17:00 + Viernes 05:00 · paiz · Paiz · Juguetes · Figuras de Acción y Coleccionables
  ('03d73ff9-9894-41a0-9d6b-3c152d477874'::uuid, timestamp '2026-10-05 16:55', 10080),  -- Lunes 17:00 · steren · Steren - Outlet
  ('6d2d3ea3-d5bc-4317-af88-a55b63a5409f'::uuid, timestamp '2026-10-05 17:55', 5040),  -- Lunes 18:00 + Viernes 06:00 · walmarthn · Walmart HN - Hogar / Escritorios y Muebles de Oficina
  ('3200a3ce-0749-422c-b92e-1b2d98b75178'::uuid, timestamp '2026-10-05 18:55', 5040),  -- Lunes 19:00 + Viernes 07:00 · walmarthn · Walmart HN - Farmacia
  ('1e86d1e4-067d-43f4-9da7-e3a57aa06641'::uuid, timestamp '2026-10-05 19:55', 5040),  -- Lunes 20:00 + Viernes 08:00 · walmarthn · Walmart HN - Deportes
  ('e3606860-4797-42e7-be76-83ad258de752'::uuid, timestamp '2026-10-05 20:55', 5040),  -- Lunes 21:00 + Viernes 09:00 · paiz · Paiz · Lácteos
  ('2183ad78-99fd-49e1-905f-3d46b97e769a'::uuid, timestamp '2026-10-05 21:55', 10080),  -- Lunes 22:00 · gamestation · Gamestation - Playstation
  ('56ca0354-0d78-458e-bd4b-d414a2163a5f'::uuid, timestamp '2026-10-05 22:55', 10080),  -- Lunes 23:00 · jetstereo · Jetstereo - Catalogo completo
  ('bf29d29a-2a84-4deb-abc7-a3a53bf58305'::uuid, timestamp '2026-10-05 23:55', 10080),  -- Martes 00:00 · gamestation · Gamestation - Nintendo
  ('b1c54738-7e93-4373-9e78-8bf93ddb115a'::uuid, timestamp '2026-10-06 00:55', 10080),  -- Martes 01:00 · steren · Steren - Catalogo completo
  ('91da215f-f3da-46cc-bbd0-28866d6c9627'::uuid, timestamp '2026-10-06 01:55', 10080),  -- Martes 02:00 · zara · Zara - Hombre
  ('ab2b8f59-7e4e-4bb3-bd7c-969dce5c64af'::uuid, timestamp '2026-10-06 02:55', 10080),  -- Martes 03:00 · metromedia · Metromedia - Libros en Ingles
  ('20cede7d-c558-49c8-a690-90113686ce94'::uuid, timestamp '2026-10-06 03:55', 5040),  -- Martes 04:00 + Viernes 16:00 · paiz · Paiz · Farmacia
  ('0f88c6f3-76d6-4fe8-b3fb-e4c083b31377'::uuid, timestamp '2026-10-06 04:55', 5040),  -- Martes 05:00 + Viernes 17:00 · walmarthn · Walmart HN - Panaderia y Tortilleria
  ('ed88a199-020c-493d-9ab2-3f2318f77267'::uuid, timestamp '2026-10-06 05:55', 5040),  -- Martes 06:00 + Viernes 18:00 · paiz · Paiz · Cervezas, Vinos y Licores
  ('350b8391-b790-4e1f-9fdd-2fbdc4afa852'::uuid, timestamp '2026-10-06 06:55', 5040),  -- Martes 07:00 + Viernes 19:00 · paiz · Paiz · Higiene y Belleza
  ('8bf7cbe2-4c3a-4510-8e8e-87359bc07a46'::uuid, timestamp '2026-10-06 07:55', 5040),  -- Martes 08:00 + Viernes 20:00 · walmarthn · Walmart HN - Juguetes
  ('f10f2ed9-e2bd-4edc-816f-0a727da75496'::uuid, timestamp '2026-10-06 08:55', 5040),  -- Martes 09:00 + Viernes 21:00 · walmarthn · Walmart HN - Bebes y Ninos
  ('0bac121c-b817-4760-8632-9ba4946c75ef'::uuid, timestamp '2026-10-06 09:55', 5040),  -- Martes 10:00 + Viernes 22:00 · walmarthn · Walmart HN - Abarrotes
  ('4efbadcc-b5d4-4fd8-af88-36888a56f083'::uuid, timestamp '2026-10-06 10:55', 5040),  -- Martes 11:00 + Viernes 23:00 · comisariato-los-andes · Catalogo completo
  ('4628505e-b5fd-430a-b933-60741e884d3b'::uuid, timestamp '2026-10-06 11:55', 5040),  -- Martes 12:00 + Sabado 00:00 · paiz · Paiz · Alimentos Congelados
  ('eaed981c-bc9d-4d8c-993b-6578b18664f1'::uuid, timestamp '2026-10-06 11:55', 10080),  -- Martes 12:00 · larach · Larach - Herramientas Eléctricas
  ('69f6c141-cc9d-4a11-93f4-51ebcacbde90'::uuid, timestamp '2026-10-06 12:55', 5040),  -- Martes 13:00 + Sabado 01:00 · walmarthn · Walmart HN - Hogar / Comedores y Muebles de Cocina
  ('bc5e8ba5-64ec-4333-abba-11785305d765'::uuid, timestamp '2026-10-06 12:55', 10080),  -- Martes 13:00 · metromedia · Metromedia - Accesorios
  ('63d3d157-3f73-4265-bf4d-9290729241fb'::uuid, timestamp '2026-10-06 13:55', 5040),  -- Martes 14:00 + Sabado 02:00 · paiz · Paiz · Juguetes · Arte, Manualidades y Creatividad
  ('e9c367ac-aa07-491d-a83d-42d2c05a27c9'::uuid, timestamp '2026-10-06 13:55', 10080),  -- Martes 14:00 · larach · Larach - Loza y Cerámica
  ('1d9d4eb1-b086-41c6-942d-3d4c5abf27d7'::uuid, timestamp '2026-10-06 14:55', 5040),  -- Martes 15:00 + Sabado 03:00 · paiz · Paiz · Juguetes · Juegos de Mesa, Cartas y Rompecabezas
  ('b8192ff8-4603-4dd6-9ee0-d477c08b291a'::uuid, timestamp '2026-10-06 15:55', 5040),  -- Martes 16:00 + Sabado 04:00 · paiz · Paiz · Juguetes · Juguetes Exterior
  ('6ede74f0-7749-46a9-a5a2-a44963c18d4f'::uuid, timestamp '2026-10-06 16:55', 5040),  -- Martes 17:00 + Sabado 05:00 · paiz · Paiz · Juguetes · Juguetes Educativos
  ('d03ae5f6-3a16-4d18-a4b1-647bffc91dee'::uuid, timestamp '2026-10-06 17:55', 10080),  -- Martes 18:00 · larach · Larach - Mascotas
  ('5daae218-4f74-454c-a018-1c4fd10a6688'::uuid, timestamp '2026-10-06 18:55', 5040),  -- Martes 19:00 + Sabado 07:00 · walmarthn · Walmart HN - Hogar / Articulos de Temporada
  ('185842e7-bb6d-41ee-a5e7-a9b06726a47c'::uuid, timestamp '2026-10-06 19:55', 5040),  -- Martes 20:00 + Sabado 08:00 · walmarthn · Walmart HN - Hogar / Accesorios para Cocina
  ('52d79338-2887-48ac-980d-03e46ab1346c'::uuid, timestamp '2026-10-06 20:55', 5040),  -- Martes 21:00 + Sabado 09:00 · walmarthn · Walmart HN - Autos
  ('eb71e3de-87b6-4671-8a30-805f42e1a011'::uuid, timestamp '2026-10-06 21:55', 5040),  -- Martes 22:00 + Sabado 10:00 · walmarthn · Walmart HN - Hogar / Colchones y Blancos
  ('5f96c9bd-97b5-4d5b-8802-b044399156ef'::uuid, timestamp '2026-10-06 22:55', 5040),  -- Martes 23:00 + Sabado 11:00 · paiz · Paiz · Panadería y Tortillería
  ('20a2aac6-a322-4418-8f64-8aa1ec71f9ba'::uuid, timestamp '2026-10-06 23:55', 5040),  -- Miercoles 00:00 + Sabado 12:00 · walmarthn · Walmart HN - Hogar / Decoracion y Muebles
  ('f344cac0-54ab-45b1-adda-06717be4f694'::uuid, timestamp '2026-10-07 00:55', 5040),  -- Miercoles 01:00 + Sabado 13:00 · walmarthn · Walmart HN - Hogar / Papeleria
  ('ed28b578-71b1-4afe-9d17-a2cd8de01f0b'::uuid, timestamp '2026-10-07 01:55', 5040),  -- Miercoles 02:00 + Sabado 14:00 · paiz · Paiz · Artículos para el Hogar
  ('e1c56218-cd45-469e-a4ce-e6ca954ede61'::uuid, timestamp '2026-10-07 02:55', 5040),  -- Miercoles 03:00 + Sabado 15:00 · walmarthn · Walmart HN - Frutas y Verduras
  ('739eaedf-ede8-4fc9-981d-3e4e9f62a161'::uuid, timestamp '2026-10-07 03:55', 5040),  -- Miercoles 04:00 + Sabado 16:00 · paiz · Paiz · Frutas y Verduras
  ('faf454ff-328b-444f-8fbc-6f0cc1962653'::uuid, timestamp '2026-10-07 04:55', 5040),  -- Miercoles 05:00 + Sabado 17:00 · walmarthn · Walmart HN - Hogar / Jardineria y Exteriores
  ('e1e8cc3e-6240-4752-a58f-57f530d846f7'::uuid, timestamp '2026-10-07 05:55', 5040),  -- Miercoles 06:00 + Sabado 18:00 · paiz · Paiz · Electrónica
  ('a5df15db-2784-4952-946d-14a939a09b73'::uuid, timestamp '2026-10-07 06:55', 5040),  -- Miercoles 07:00 + Sabado 19:00 · walmarthn · Walmart HN - Ropa y Zapateria
  ('409921b3-25a4-4814-82b0-74476adf796d'::uuid, timestamp '2026-10-07 07:55', 5040),  -- Miercoles 08:00 + Sabado 20:00 · paiz · Paiz · Limpieza
  ('361d457a-f891-4acf-b35f-781a5296dcec'::uuid, timestamp '2026-10-07 08:55', 5040),  -- Miercoles 09:00 + Sabado 21:00 · walmarthn · Walmart HN - Electronica
  ('b852040a-d695-4189-9f85-a9163bc65b0a'::uuid, timestamp '2026-10-07 09:55', 10080),  -- Miercoles 10:00 · metromedia · Metromedia - Libros para colorear
  ('e4b6222e-af6f-4eb3-a4cf-cf6561055a72'::uuid, timestamp '2026-10-07 10:55', 10080),  -- Miercoles 11:00 · metromedia · Metromedia - Separadores
  ('68dd338f-eb4f-4ef4-846e-953b8badd1f5'::uuid, timestamp '2026-10-07 11:55', 5040),  -- Miercoles 12:00 + Domingo 00:00 · walmarthn · Walmart HN - Hogar / Salas y Centro de Entretenimiento
  ('41214954-b408-4bbf-8302-98b70baaa55e'::uuid, timestamp '2026-10-07 11:55', 10080),  -- Miercoles 12:00 · gamestation · Gamestation - Codigos digitales
  ('ba355a70-9987-41d0-8b50-dbc75150402f'::uuid, timestamp '2026-10-07 12:55', 5040),  -- Miercoles 13:00 + Domingo 01:00 · paiz · Paiz · Juguetes · Bebés y Preescolar
  ('82854595-b020-4c93-8afc-c84c5e829148'::uuid, timestamp '2026-10-07 12:55', 10080),  -- Miercoles 13:00 · larach · Larach - Tecnología
  ('3d56a519-f98e-4c70-b2cf-cc862ede67c8'::uuid, timestamp '2026-10-07 13:55', 5040),  -- Miercoles 14:00 + Domingo 02:00 · paiz · Paiz · Juguetes · Bloques y Construcción
  ('812d78c4-c647-4f0c-b394-e0aa90a94279'::uuid, timestamp '2026-10-07 13:55', 10080),  -- Miercoles 14:00 · larach · Larach - Abarroteria
  ('7733e57c-8d13-4914-88fe-b3b4777308dd'::uuid, timestamp '2026-10-07 14:55', 5040),  -- Miercoles 15:00 + Domingo 03:00 · paiz · Paiz · Juguetes · Juegos de Imitación y Roles
  ('c4dad987-6723-46b7-9024-80349eccc35f'::uuid, timestamp '2026-10-07 15:55', 10080),  -- Miercoles 16:00 · larach · Larach - Herrajes
  ('69338c9c-ecd3-419d-8c61-9b3ed665e803'::uuid, timestamp '2026-10-07 16:55', 10080),  -- Miercoles 17:00 · okashi · Okashi - Cat?logo completo
  ('b8e491de-dd19-4a0d-917f-c6606bce79c3'::uuid, timestamp '2026-10-07 17:55', 10080),  -- Miercoles 18:00 · jetstereo · Jetstereo - Celulares y Accesorios
  ('982d6753-c3f4-40f4-8b4e-be52a246e5fe'::uuid, timestamp '2026-10-07 18:55', 5040),  -- Miercoles 19:00 + Domingo 07:00 · walmarthn · Walmart HN - Limpieza
  ('621213cc-4b71-4e99-9917-0ae70b1a34fb'::uuid, timestamp '2026-10-07 19:55', 5040),  -- Miercoles 20:00 + Domingo 08:00 · paiz · Paiz · Jugos y Bebidas
  ('0aaf0703-72cf-4ed7-a4bd-e6af22f4f9a6'::uuid, timestamp '2026-10-07 20:55', 5040),  -- Miercoles 21:00 + Domingo 09:00 · walmarthn · Walmart HN - Carnes, Embutidos y Mariscos
  ('b14e5e36-4ba1-43a3-8c40-97e368284216'::uuid, timestamp '2026-10-07 21:55', 5040),  -- Miercoles 22:00 + Domingo 10:00 · walmarthn · Walmart HN - Hogar / Organizacion y Almacenamiento
  ('488d62ca-3bf3-4fd1-b52d-90aef7ba74b9'::uuid, timestamp '2026-10-07 22:55', 5040),  -- Miercoles 23:00 + Domingo 11:00 · paiz · Paiz · Deportes
  ('262091b8-a201-416b-9d7f-6bcc35c61c4e'::uuid, timestamp '2026-10-07 23:55', 5040),  -- Jueves 00:00 + Domingo 12:00 · paiz · Paiz · Bebés y Niños
  ('f588af2c-00ca-4002-8807-d2b96440ff95'::uuid, timestamp '2026-10-08 00:55', 5040),  -- Jueves 01:00 + Domingo 13:00 · walmarthn · Walmart HN - Mascota
  ('b6a55d6f-c34d-4b8d-9ea5-cc94e2fd126b'::uuid, timestamp '2026-10-08 01:55', 5040),  -- Jueves 02:00 + Domingo 14:00 · paiz · Paiz · Mascotas
  ('e0b65b81-2038-4a7c-af2b-623e45298e68'::uuid, timestamp '2026-10-08 02:55', 5040),  -- Jueves 03:00 + Domingo 15:00 · walmarthn · Walmart HN - Hogar / Accesorios para Mesa
  ('a5ffc30b-8f8b-48f9-a766-e519443d99c8'::uuid, timestamp '2026-10-08 03:55', 5040),  -- Jueves 04:00 + Domingo 16:00 · walmarthn · Walmart HN - Alimentos Congelados
  ('b28ec91d-38ef-4515-bc01-f99a39e1c52c'::uuid, timestamp '2026-10-08 04:55', 5040),  -- Jueves 05:00 + Domingo 17:00 · paiz · Paiz · Carnes, Embutidos y Mariscos
  ('1ffc6a30-f61a-4b6c-8b4b-a817f5f2185a'::uuid, timestamp '2026-10-08 05:55', 5040),  -- Jueves 06:00 + Domingo 18:00 · paiz · Paiz · Juguetes · Peluches y Muñecas
  ('3cfb2b3a-81af-41a9-b1f0-43ff3ee49da7'::uuid, timestamp '2026-10-08 06:55', 5040),  -- Jueves 07:00 + Domingo 19:00 · walmarthn · Walmart HN - Lacteos
  ('4550cef7-1f89-4eac-bacf-a7bdfff91360'::uuid, timestamp '2026-10-08 07:55', 5040),  -- Jueves 08:00 + Domingo 20:00 · walmarthn · Walmart HN - Jugos y Bebidas
  ('cf45a505-c1d2-4306-980b-2a1cd2527d78'::uuid, timestamp '2026-10-08 08:55', 5040),  -- Jueves 09:00 + Domingo 21:00 · walmarthn · Walmart HN - Cervezas, Vinos y Licores
  ('cd0b46d3-4dd0-4f54-b19b-a1242a41e097'::uuid, timestamp '2026-10-08 09:55', 10080),  -- Jueves 10:00 · larach · Larach - Papeleria
  ('a60e202b-30cf-470c-adb5-617a16464b7b'::uuid, timestamp '2026-10-08 10:55', 10080),  -- Jueves 11:00 · larach · Larach - Electricidad
  ('00f225ac-11b8-4b3c-a2a4-f86d0edad89e'::uuid, timestamp '2026-10-08 11:55', 10080),  -- Jueves 12:00 · meyko · Meyko - Catalogo completo
  ('6c920f59-958f-4868-98f2-53d445f08fcb'::uuid, timestamp '2026-10-08 11:55', 10080),  -- Jueves 12:00 · metromedia · Metromedia - Agendas
  ('52434158-fa24-4d4a-87b2-e5db7fa9ae3d'::uuid, timestamp '2026-10-08 12:55', 10080),  -- Jueves 13:00 · prive · Catalogo completo
  ('24f4ee8b-5253-4a6b-8c67-adc02c62d0c3'::uuid, timestamp '2026-10-08 13:55', 10080),  -- Jueves 14:00 · utilesdehonduras · Catálogo completo (sitemap)
  ('1e2beeac-8bd0-4916-bc9e-1ed590f20830'::uuid, timestamp '2026-10-08 14:55', 10080),  -- Jueves 15:00 · zara · Zara - Mujer
  ('0665aa37-5ee2-490e-ab8e-e24daf98449b'::uuid, timestamp '2026-10-08 15:55', 10080),  -- Jueves 16:00 · gamestation · Gamestation - Xbox
  ('0a3ea74c-8bb7-4cd2-8a42-74b0c1aed5e2'::uuid, timestamp '2026-10-08 16:55', 10080),  -- Jueves 17:00 · pcbuilds · PC Builds - Catalogo completo
  ('38b7145e-dfa4-4602-8817-07d868739da4'::uuid, timestamp '2026-10-08 17:55', 10080),  -- Jueves 18:00 · metromedia · Metromedia - Libretas
  ('9c30778d-4384-4905-b386-113a698034e9'::uuid, timestamp '2026-10-09 09:55', 10080),  -- Viernes 10:00 · larach · Larach - Galletas
  ('0f006088-8dfc-4056-990c-ad0ee30042dc'::uuid, timestamp '2026-10-09 10:55', 10080),  -- Viernes 11:00 · larach · Larach - Herramientas Manuales
  ('2383228e-0076-4126-ab4e-c2be691b7478'::uuid, timestamp '2026-10-09 11:55', 10080),  -- Viernes 12:00 · gamestation · Gamestation - Coleccionables
  ('e178186c-7ce1-46bc-ad04-28a77b98226d'::uuid, timestamp '2026-10-09 12:55', 10080),  -- Viernes 13:00 · gamestation · Gamestation - Tecnologia
  ('7932807b-3137-4274-a1cd-8df3ab91e0e4'::uuid, timestamp '2026-10-09 13:55', 10080),  -- Viernes 14:00 · metromedia · Metromedia - Comics
  ('324ff3ea-a92e-4b8f-9fe3-0b2cb7377e63'::uuid, timestamp '2026-10-09 14:55', 10080),  -- Viernes 15:00 · metromedia · Metromedia - Literatura Hondurena
  ('b77eee47-6a5d-456c-92c9-1df1a868e75e'::uuid, timestamp '2026-10-10 05:55', 10080),  -- Sabado 06:00 · metromedia · Metromedia - Biblia
  ('5cac61d3-85ae-4926-ae45-031e58fd6e96'::uuid, timestamp '2026-10-10 21:55', 10080),  -- Sabado 22:00 · larach · Larach - Fontanería
  ('16294d0e-9960-411f-b634-2596acd53652'::uuid, timestamp '2026-10-10 22:55', 10080),  -- Sabado 23:00 · larach · Larach - Navidad
  ('2eb52704-f98e-4a30-b310-0868e7710239'::uuid, timestamp '2026-10-11 03:55', 10080),  -- Domingo 04:00 · larach · Larach - Hogar
  ('6ccdcb38-000d-499c-a08c-52dc3d8b4050'::uuid, timestamp '2026-10-11 04:55', 10080),  -- Domingo 05:00 · larach · Larach - Jardinería
  ('7c6f626a-f431-4a8b-8326-dfc624d211ec'::uuid, timestamp '2026-10-11 05:55', 10080),  -- Domingo 06:00 · metromedia · Metromedia - Coffee Table Books
  ('fe67cd7f-4cb7-430e-a437-07e66fec6ce6'::uuid, timestamp '2026-10-11 21:55', 10080),  -- Domingo 22:00 · larach · Larach - Pinturas
  ('992f617a-94fd-461f-a23a-87a2868d0be3'::uuid, timestamp '2026-10-11 22:55', 10080)   -- Domingo 23:00 · metromedia · Metromedia - Calendarios
)
update find_your_prices.scrape_targets t
set
  schedule_anchor_at = (p.anchor_local at time zone 'America/Tegucigalpa'),
  frequency_minutes  = p.frequency_minutes,
  -- Primer punto de la rejilla a partir de ahora. Sin esto, los targets que
  -- llevan semanas sin correr estarian todos vencidos y el cron los drenaria
  -- de 2 en 2 sin respetar la agenda.
  next_run_at = (p.anchor_local at time zone 'America/Tegucigalpa')
    + make_interval(mins => p.frequency_minutes) * ceil(greatest(0,
        extract(epoch from now() - (p.anchor_local at time zone 'America/Tegucigalpa'))
      ) / (p.frequency_minutes * 60))::int,
  updated_at = now()
from plan p
where t.id = p.target_id;

commit;

-- -----------------------------------------------------------------------------
-- Verificacion (correr aparte). Debe devolver 0 filas: ninguna hora con mas de
-- 2 targets activos.
-- -----------------------------------------------------------------------------
-- select to_char(next_run_at at time zone 'America/Tegucigalpa', 'Dy HH24:MI') as hora,
--        count(*), string_agg(name, ' + ')
-- from find_your_prices.scrape_targets
-- where is_active
-- group by 1 having count(*) > 2;
--
-- Proximas 24 h:
-- select to_char(next_run_at at time zone 'America/Tegucigalpa', 'Dy DD HH24:MI') as hora, name
-- from find_your_prices.scrape_targets
-- where is_active and next_run_at < now() + interval '24 hours'
-- order by next_run_at;
