# Agenda semanal de scraping

Generada para la migración `0046_weekly_scrape_schedule.sql`. Horas en
**America/Tegucigalpa** (UTC−6). El cron dispara una vez por hora en punto con
`limit=2&timeBudgetMs=270000`; cada fila es lo que vence en esa tanda.

- **2×/semana** (cada 3.5 días): walmarthn, paiz, pricesmart,
  comisariato-los-andes, kielsa, farmaciasiman. Aparecen dos veces, separadas 84 h.
- **1×/semana**: todo lo demás.
- "Est. tanda" = máximo medido en `scrape_runs` × 1.15. Los pesados (> 112 s)
  van solos.

Targets inactivos que no se tocaron: ACOSA · Cables de red, Diunsa · Jugueteria,
Paiz · Juguetes, RadioShack HN · Catalogo completo, Walmart HN · Articulos para
el hogar.

| Día / hora (HN) | Target 1 | Target 2 | Est. tanda |
|---|---|---|---|
| Lunes 00:00 | acosa · Catalogo completo |  | ~342 s |
| Lunes 01:00 | zara · Ninos |  | ~284 s |
| Lunes 02:00 | metromedia · Libros en Espanol |  | ~254 s |
| Lunes 03:00 | ladylee · Catalogo completo |  | ~213 s |
| Lunes 04:00 | paperdepot · Catalogo completo |  | ~181 s |
| Lunes 05:00 | officedepot · Catalogo completo |  | ~152 s |
| Lunes 06:00 | diunsa · Catalogo completo |  | ~150 s |
| Lunes 07:00 | paiz · Abarrotes |  | ~112 s |
| Lunes 08:00 | pricesmart · Catalogo completo |  | ~111 s |
| Lunes 09:00 | kielsa · Catalogo completo |  | ~84 s |
| Lunes 10:00 | farmaciasiman · Catalogo completo |  | ~281 s |
| Lunes 11:00 | walmarthn · Higiene y Belleza |  | ~190 s |
| Lunes 12:00 | walmarthn · Hogar / Ferreteria | larach · Construcción | ~34 s |
| Lunes 13:00 | walmarthn · Hogar / Pintura | metromedia · Entretenimiento | ~22 s |
| Lunes 14:00 | paiz · Autos | larach · Automotriz | ~19 s |
| Lunes 15:00 | paiz · Juguetes · Vehículos, Pistas y Control Remoto | radioshack-hn · Audifonos | ~16 s |
| Lunes 16:00 | walmarthn · Hogar / Libros y Revistas | larach · Lámparas | ~11 s |
| Lunes 17:00 | paiz · Juguetes · Figuras de Acción y Coleccionables | steren · Outlet | ~9 s |
| Lunes 18:00 | walmarthn · Hogar / Escritorios y Muebles de Oficina |  | ~3 s |
| Lunes 19:00 | walmarthn · Farmacia |  | ~46 s |
| Lunes 20:00 | walmarthn · Deportes |  | ~31 s |
| Lunes 21:00 | paiz · Lácteos |  | ~26 s |
| Lunes 22:00 | gamestation · Playstation |  | ~132 s |
| Lunes 23:00 | jetstereo · Catalogo completo |  | ~130 s |
| Martes 00:00 | gamestation · Nintendo |  | ~131 s |
| Martes 01:00 | steren · Catalogo completo |  | ~119 s |
| Martes 02:00 | zara · Hombre |  | ~113 s |
| Martes 03:00 | metromedia · Libros en Ingles |  | ~113 s |
| Martes 04:00 | paiz · Farmacia |  | ~26 s |
| Martes 05:00 | walmarthn · Panaderia y Tortilleria |  | ~20 s |
| Martes 06:00 | paiz · Cervezas, Vinos y Licores |  | ~19 s |
| Martes 07:00 | paiz · Higiene y Belleza |  | ~90 s |
| Martes 08:00 | walmarthn · Juguetes |  | ~72 s |
| Martes 09:00 | walmarthn · Bebes y Ninos |  | ~45 s |
| Martes 10:00 | walmarthn · Abarrotes |  | ~189 s |
| Martes 11:00 | comisariato-los-andes · Catalogo completo |  | ~125 s |
| Martes 12:00 | paiz · Alimentos Congelados | larach · Herramientas Eléctricas | ~35 s |
| Martes 13:00 | walmarthn · Hogar / Comedores y Muebles de Cocina | metromedia · Accesorios | ~10 s |
| Martes 14:00 | paiz · Juguetes · Arte, Manualidades y Creatividad | larach · Loza y Cerámica | ~7 s |
| Martes 15:00 | paiz · Juguetes · Juegos de Mesa, Cartas y Rompecabezas |  | ~2 s |
| Martes 16:00 | paiz · Juguetes · Juguetes Exterior |  | ~2 s |
| Martes 17:00 | paiz · Juguetes · Juguetes Educativos |  | ~1 s |
| Martes 18:00 | larach · Mascotas |  | ~107 s |
| Martes 19:00 | walmarthn · Hogar / Articulos de Temporada |  | ~58 s |
| Martes 20:00 | walmarthn · Hogar / Accesorios para Cocina |  | ~36 s |
| Martes 21:00 | walmarthn · Autos |  | ~28 s |
| Martes 22:00 | walmarthn · Hogar / Colchones y Blancos |  | ~18 s |
| Martes 23:00 | paiz · Panadería y Tortillería |  | ~14 s |
| Miercoles 00:00 | walmarthn · Hogar / Decoracion y Muebles |  | ~26 s |
| Miercoles 01:00 | walmarthn · Hogar / Papeleria |  | ~24 s |
| Miercoles 02:00 | paiz · Artículos para el Hogar |  | ~24 s |
| Miercoles 03:00 | walmarthn · Frutas y Verduras |  | ~20 s |
| Miercoles 04:00 | paiz · Frutas y Verduras |  | ~17 s |
| Miercoles 05:00 | walmarthn · Hogar / Jardineria y Exteriores |  | ~15 s |
| Miercoles 06:00 | paiz · Electrónica |  | ~11 s |
| Miercoles 07:00 | walmarthn · Ropa y Zapateria |  | ~112 s |
| Miercoles 08:00 | paiz · Limpieza |  | ~77 s |
| Miercoles 09:00 | walmarthn · Electronica |  | ~53 s |
| Miercoles 10:00 | metromedia · Libros para colorear |  | ~34 s |
| Miercoles 11:00 | metromedia · Separadores |  | ~28 s |
| Miercoles 12:00 | walmarthn · Hogar / Salas y Centro de Entretenimiento | gamestation · Codigos digitales | ~13 s |
| Miercoles 13:00 | paiz · Juguetes · Bebés y Preescolar | larach · Tecnología | ~10 s |
| Miercoles 14:00 | paiz · Juguetes · Bloques y Construcción | larach · Abarroteria | ~6 s |
| Miercoles 15:00 | paiz · Juguetes · Juegos de Imitación y Roles |  | ~1 s |
| Miercoles 16:00 | larach · Herrajes |  | ~98 s |
| Miercoles 17:00 | okashi · Cat�logo completo |  | ~95 s |
| Miercoles 18:00 | jetstereo · Celulares y Accesorios |  | ~90 s |
| Miercoles 19:00 | walmarthn · Limpieza |  | ~74 s |
| Miercoles 20:00 | paiz · Jugos y Bebidas |  | ~37 s |
| Miercoles 21:00 | walmarthn · Carnes, Embutidos y Mariscos |  | ~26 s |
| Miercoles 22:00 | walmarthn · Hogar / Organizacion y Almacenamiento |  | ~10 s |
| Miercoles 23:00 | paiz · Deportes |  | ~7 s |
| Jueves 00:00 | paiz · Bebés y Niños |  | ~25 s |
| Jueves 01:00 | walmarthn · Mascota |  | ~24 s |
| Jueves 02:00 | paiz · Mascotas |  | ~23 s |
| Jueves 03:00 | walmarthn · Hogar / Accesorios para Mesa |  | ~22 s |
| Jueves 04:00 | walmarthn · Alimentos Congelados |  | ~20 s |
| Jueves 05:00 | paiz · Carnes, Embutidos y Mariscos |  | ~15 s |
| Jueves 06:00 | paiz · Juguetes · Peluches y Muñecas |  | ~11 s |
| Jueves 07:00 | walmarthn · Lacteos |  | ~62 s |
| Jueves 08:00 | walmarthn · Jugos y Bebidas |  | ~47 s |
| Jueves 09:00 | walmarthn · Cervezas, Vinos y Licores |  | ~41 s |
| Jueves 10:00 | larach · Papeleria |  | ~36 s |
| Jueves 11:00 | larach · Electricidad |  | ~28 s |
| Jueves 12:00 | meyko · Catalogo completo | metromedia · Agendas | ~84 s |
| Jueves 13:00 | prive · Catalogo completo |  | ~70 s |
| Jueves 14:00 | utilesdehonduras · Catálogo completo (sitemap) |  | ~67 s |
| Jueves 15:00 | zara · Mujer |  | ~61 s |
| Jueves 16:00 | gamestation · Xbox |  | ~61 s |
| Jueves 17:00 | pcbuilds · Catalogo completo |  | ~54 s |
| Jueves 18:00 | metromedia · Libretas |  | ~41 s |
| Jueves 19:00 | paiz · Abarrotes |  | ~112 s |
| Jueves 20:00 | pricesmart · Catalogo completo |  | ~111 s |
| Jueves 21:00 | kielsa · Catalogo completo |  | ~84 s |
| Jueves 22:00 | farmaciasiman · Catalogo completo |  | ~281 s |
| Jueves 23:00 | walmarthn · Higiene y Belleza |  | ~190 s |
| Viernes 00:00 | walmarthn · Hogar / Ferreteria |  | ~20 s |
| Viernes 01:00 | walmarthn · Hogar / Pintura |  | ~11 s |
| Viernes 02:00 | paiz · Autos |  | ~7 s |
| Viernes 03:00 | paiz · Juguetes · Vehículos, Pistas y Control Remoto |  | ~5 s |
| Viernes 04:00 | walmarthn · Hogar / Libros y Revistas |  | ~4 s |
| Viernes 05:00 | paiz · Juguetes · Figuras de Acción y Coleccionables |  | ~3 s |
| Viernes 06:00 | walmarthn · Hogar / Escritorios y Muebles de Oficina |  | ~3 s |
| Viernes 07:00 | walmarthn · Farmacia |  | ~46 s |
| Viernes 08:00 | walmarthn · Deportes |  | ~31 s |
| Viernes 09:00 | paiz · Lácteos |  | ~26 s |
| Viernes 10:00 | larach · Galletas |  | ~33 s |
| Viernes 11:00 | larach · Herramientas Manuales |  | ~24 s |
| Viernes 12:00 | gamestation · Coleccionables |  | ~51 s |
| Viernes 13:00 | gamestation · Tecnologia |  | ~38 s |
| Viernes 14:00 | metromedia · Comics |  | ~37 s |
| Viernes 15:00 | metromedia · Literatura Hondurena |  | ~36 s |
| Viernes 16:00 | paiz · Farmacia |  | ~26 s |
| Viernes 17:00 | walmarthn · Panaderia y Tortilleria |  | ~20 s |
| Viernes 18:00 | paiz · Cervezas, Vinos y Licores |  | ~19 s |
| Viernes 19:00 | paiz · Higiene y Belleza |  | ~90 s |
| Viernes 20:00 | walmarthn · Juguetes |  | ~72 s |
| Viernes 21:00 | walmarthn · Bebes y Ninos |  | ~45 s |
| Viernes 22:00 | walmarthn · Abarrotes |  | ~189 s |
| Viernes 23:00 | comisariato-los-andes · Catalogo completo |  | ~125 s |
| Sabado 00:00 | paiz · Alimentos Congelados |  | ~25 s |
| Sabado 01:00 | walmarthn · Hogar / Comedores y Muebles de Cocina |  | ~3 s |
| Sabado 02:00 | paiz · Juguetes · Arte, Manualidades y Creatividad |  | ~2 s |
| Sabado 03:00 | paiz · Juguetes · Juegos de Mesa, Cartas y Rompecabezas |  | ~2 s |
| Sabado 04:00 | paiz · Juguetes · Juguetes Exterior |  | ~2 s |
| Sabado 05:00 | paiz · Juguetes · Juguetes Educativos |  | ~1 s |
| Sabado 06:00 | metromedia · Biblia |  | ~23 s |
| Sabado 07:00 | walmarthn · Hogar / Articulos de Temporada |  | ~58 s |
| Sabado 08:00 | walmarthn · Hogar / Accesorios para Cocina |  | ~36 s |
| Sabado 09:00 | walmarthn · Autos |  | ~28 s |
| Sabado 10:00 | walmarthn · Hogar / Colchones y Blancos |  | ~18 s |
| Sabado 11:00 | paiz · Panadería y Tortillería |  | ~14 s |
| Sabado 12:00 | walmarthn · Hogar / Decoracion y Muebles |  | ~26 s |
| Sabado 13:00 | walmarthn · Hogar / Papeleria |  | ~24 s |
| Sabado 14:00 | paiz · Artículos para el Hogar |  | ~24 s |
| Sabado 15:00 | walmarthn · Frutas y Verduras |  | ~20 s |
| Sabado 16:00 | paiz · Frutas y Verduras |  | ~17 s |
| Sabado 17:00 | walmarthn · Hogar / Jardineria y Exteriores |  | ~15 s |
| Sabado 18:00 | paiz · Electrónica |  | ~11 s |
| Sabado 19:00 | walmarthn · Ropa y Zapateria |  | ~112 s |
| Sabado 20:00 | paiz · Limpieza |  | ~77 s |
| Sabado 21:00 | walmarthn · Electronica |  | ~53 s |
| Sabado 22:00 | larach · Fontanería |  | ~21 s |
| Sabado 23:00 | larach · Navidad |  | ~18 s |
| Domingo 00:00 | walmarthn · Hogar / Salas y Centro de Entretenimiento |  | ~3 s |
| Domingo 01:00 | paiz · Juguetes · Bebés y Preescolar |  | ~2 s |
| Domingo 02:00 | paiz · Juguetes · Bloques y Construcción |  | ~2 s |
| Domingo 03:00 | paiz · Juguetes · Juegos de Imitación y Roles |  | ~1 s |
| Domingo 04:00 | larach · Hogar |  | ~19 s |
| Domingo 05:00 | larach · Jardinería |  | ~18 s |
| Domingo 06:00 | metromedia · Coffee Table Books |  | ~17 s |
| Domingo 07:00 | walmarthn · Limpieza |  | ~74 s |
| Domingo 08:00 | paiz · Jugos y Bebidas |  | ~37 s |
| Domingo 09:00 | walmarthn · Carnes, Embutidos y Mariscos |  | ~26 s |
| Domingo 10:00 | walmarthn · Hogar / Organizacion y Almacenamiento |  | ~10 s |
| Domingo 11:00 | paiz · Deportes |  | ~7 s |
| Domingo 12:00 | paiz · Bebés y Niños |  | ~25 s |
| Domingo 13:00 | walmarthn · Mascota |  | ~24 s |
| Domingo 14:00 | paiz · Mascotas |  | ~23 s |
| Domingo 15:00 | walmarthn · Hogar / Accesorios para Mesa |  | ~22 s |
| Domingo 16:00 | walmarthn · Alimentos Congelados |  | ~20 s |
| Domingo 17:00 | paiz · Carnes, Embutidos y Mariscos |  | ~15 s |
| Domingo 18:00 | paiz · Juguetes · Peluches y Muñecas |  | ~11 s |
| Domingo 19:00 | walmarthn · Lacteos |  | ~62 s |
| Domingo 20:00 | walmarthn · Jugos y Bebidas |  | ~47 s |
| Domingo 21:00 | walmarthn · Cervezas, Vinos y Licores |  | ~41 s |
| Domingo 22:00 | larach · Pinturas |  | ~16 s |
| Domingo 23:00 | metromedia · Calendarios |  | ~16 s |
