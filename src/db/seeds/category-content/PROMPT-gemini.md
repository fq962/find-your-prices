# Prompt para generar el contenido SEO de las categorías (Gemini)

Copiá desde la línea `---` hasta el final y pegalo en Gemini. Pedile **un grupo por respuesta** (cada bloque numerado de la lista es un archivo). Guardá cada respuesta como `src/db/seeds/category-content/NN-nombre.json` y luego se sube con `node scripts/seed-category-content.mjs`.

---

Sos redactor SEO senior para **Find Your Prices** (findyourprices.com), un comparador de precios de Honduras. El sitio NO vende nada: muestra el precio de cada producto en cada tienda con catálogo en línea del país, con historial de precios, y lleva a la tienda con un clic. Los precios en línea son nacionales (aplican en todo Honduras) pero la existencia varía por sucursal.

Tu trabajo: escribir el contenido de las **landing pages de categoría**, en **español de Honduras (voseo natural: «compará», «buscá», «fijate», «sabés»)** y en **inglés**. El objetivo es posicionar en Google búsquedas como «precio de televisores en honduras», «pañales baratos tegucigalpa», «dónde comprar herramientas san pedro sula». El texto tiene que sonar escrito por una persona hondureña que conoce las tiendas y la vida diaria del país, no por una plantilla.

## Formato de salida

Devolvé **solo un JSON válido** (sin texto antes ni después, sin ```), un array con un objeto por categoría, exactamente con esta forma:

```
[
  {
    "slug": "el-slug-tal-cual-te-lo-doy",
    "es": {
      "title": "...",
      "meta": "...",
      "intro": "...",
      "body": "...",
      "keywords": ["...", "..."]
    },
    "en": {
      "title": "...",
      "meta": "...",
      "intro": "...",
      "body": "...",
      "keywords": ["...", "..."]
    }
  }
]
```

Reglas de cada campo:

- **slug**: copialo exacto de la lista, no lo inventés ni lo traduzcas.
- **title** (50–65 caracteres): es el `<title>` del resultado de Google. Fórmula base «{Categoría}: precios en Honduras» o variantes con intención («{Categoría} en Honduras: precios comparados», «Precio de {categoría} en Honduras»). Sin nombre de marca del sitio (se agrega solo).
- **meta** (140–160 caracteres, máximo 300): meta description. Debe nombrar la categoría, «Honduras», 2–4 tiendas relevantes y un beneficio (precio actualizado, historial, comparar por libra/unidad). Sin comillas dobles.
- **intro** (1–2 oraciones, 150–260 caracteres): el párrafo bajo el título. Humano, concreto, con un ejemplo de producto real del rubro.
- **body** (Markdown mínimo): SOLO se admite `## Subtítulo`, `### Pregunta frecuente`, párrafos separados por línea en blanco, listas con `- ` y `**negrita**`. Nada de HTML, tablas, enlaces ni imágenes. Usá `\n\n` entre bloques dentro del string JSON. Estructura:
  - Para una **categoría raíz**: 4 secciones `##` (dónde comprar más barato en Honduras / cómo comparar bien en este rubro con 3–4 viñetas / qué incluye la categoría nombrando sus subcategorías / precios por ciudad) + 2 preguntas `###` con respuesta de 1–2 oraciones. 220–320 palabras en español.
  - Para una **subcategoría**: 3 secciones `##` (qué productos y marcas hay / cómo elegir o pagar menos con viñetas / dónde o cuándo conviene) + 1 pregunta `###`. 140–220 palabras en español.
  - El inglés es una versión equivalente y natural, no una traducción literal; misma estructura.
- **keywords** (6–10 en español, 4–6 en inglés): intención de búsqueda real, en minúsculas y sin acentos: «precio de X honduras», «X baratos tegucigalpa», «donde comprar X san pedro sula», «X precio hoy», marcas y tiendas relevantes. No repitas la misma frase con y sin acento.

## Reglas de contenido

1. **Cada categoría es única.** No reciclés párrafos entre categorías: cambiá ejemplos, marcas, consejos y ciudades. Google penaliza texto duplicado entre landings.
2. **Marcas y productos reales del rubro** que se venden en Honduras (por ejemplo: pañales Huggies y Pampers; televisores Samsung, LG y TCL; herramientas DeWalt, Truper y Stanley; detergente Ariel, Xedex y Rinso; comida para perros Dog Chow, Pedigree y Pro Plan). Si no estás seguro de una marca, no la inventés.
3. **Tiendas según el rubro** (solo estas, son las que tienen catálogo en el sitio):
   - Supermercado / limpieza / higiene / bebés / mascotas: Walmart, Paiz, Comisariato, PriceSmart.
   - Farmacia y salud: Farmacia Siman, Walmart, PriceSmart.
   - Electrónica, celulares, computación, línea blanca: Jetstereo, RadioShack, Steren, Diunsa, Walmart, PriceSmart.
   - Gaming (PlayStation, Xbox, Nintendo): Game Station, Diunsa, Jetstereo.
   - Hogar, decoración, colchones, cocina, juguetes, ropa, calzado, deportes: Diunsa, Lady Lee, Walmart, PriceSmart.
   - Ferretería, pintura, electricidad, plomería, autos: Larach y Cía, ACOSA, Walmart.
   - Librería y papelería: Larach y Cía, Diunsa, Walmart, Paiz.
   - Temporada (Navidad, Halloween, liquidación): Diunsa, Lady Lee, Walmart, Larach.
4. **Ciudades de Honduras**, mencionadas con naturalidad (no como lista pegada), rotando entre categorías: Tegucigalpa, Comayagüela, San Pedro Sula, La Ceiba, Choloma, El Progreso, Comayagua, Choluteca, Juticalpa, Catacamas, Danlí, Siguatepeque, Santa Rosa de Copán, Tela, Roatán, Puerto Cortés, Villanueva, La Lima, Olanchito, Tocoa. Un dato local cuando aplique (ej.: Feria Juniana en San Pedro Sula, Semana Santa en Tela y La Ceiba, zona ganadera de Olancho, Feria Isidra en La Ceiba, regreso a clases en febrero, Navidad).
5. **Temporadas y momentos de compra** propios del rubro: regreso a clases (enero–febrero), Día de la Madre (mayo), Día del Niño (10 de septiembre), Black Friday, Navidad, Semana Santa, temporada de lluvias.
6. **Consejos de compra concretos**: comparar por libra/litro/unidad, revisar el historial para saber si la «oferta» es real, dividir paquetes de PriceSmart para comparar, buscar el modelo exacto, etc.
7. **Tono**: cercano, directo, útil; segunda persona con voseo en español. Nada de relleno ni de promesas («los mejores precios garantizados»). Nunca digas que el sitio vende, entrega o tiene sucursales: es un comparador.
8. **Sin comillas dobles dentro de los textos** (usá «comillas latinas» o comillas simples) para que el JSON sea válido. Escapá los saltos de línea como `\n`.
9. Una categoría con 0 artículos igual recibe contenido (se activará cuando entren productos), pero no menciones cifras de cantidad de artículos en ningún texto: la página las agrega sola.

## Ejemplo de una entrada terminada (para que copiés el estilo y el nivel de detalle)

```
{
  "slug": "huevos",
  "es": {
    "title": "Huevos: precio del cartón en Honduras",
    "meta": "Precio del cartón de huevos de 15 y 30 unidades, blancos y rojos, en Walmart, Paiz, Comisariato y PriceSmart de Honduras. Historial de precios para saber si bajó.",
    "intro": "El cartón de huevos es el termómetro de la canasta básica: cuando sube, todos lo saben. Acá está el precio de hoy en cada supermercado y cuánto ha cambiado.",
    "body": "## Precio del cartón de huevos hoy\n\nCartones de 15 y 30 huevos, blancos y rojos, grandes y medianos, de marcas como El Cortijo, Yema Dorada, Avícola Aleman y las propias de cada cadena. Compará por unidad: el cartón de 30 casi siempre gana, pero no en todas las tiendas.\n\n## Por qué mirar el historial\n\nEl huevo es de los productos con más subidas y bajadas del año, por la temporada, el precio del alimento de las aves y las promociones. El historial de cada ficha te dice si el precio de hoy es alto o bajo comparado con el mes pasado.\n\n## Disponibilidad\n\nLos precios en línea aplican en Tegucigalpa, San Pedro Sula, La Ceiba, Choluteca, Danlí y todo el país; la existencia varía por sucursal y cada ficha lo indica.\n\n### ¿A cuánto está el cartón de huevos en Honduras?\n\nEn esta página, ordenado por menor precio, con el dato de cada tienda actualizado varias veces al día.",
    "keywords": ["precio del carton de huevos honduras", "precio huevos hoy honduras", "carton de 30 huevos precio", "huevos precio honduras", "huevos baratos honduras", "precio del huevo hoy"]
  },
  "en": {
    "title": "Eggs: price of a carton in Honduras",
    "meta": "Price of 15 and 30-egg cartons, white and brown, at Walmart, Paiz, Comisariato and PriceSmart in Honduras. Price history to know whether it dropped.",
    "intro": "The carton of eggs is the thermometer of the basic basket: when it goes up, everyone knows. Here is today's price at each supermarket and how much it has changed.",
    "body": "## Today's price of a carton of eggs\n\n15 and 30-egg cartons, white and brown, large and medium, from brands like El Cortijo, Yema Dorada, Avícola Aleman and each chain's own. Compare per egg: the 30-carton almost always wins, but not at every store.\n\n## Why look at the history\n\nEggs are among the products with the most ups and downs of the year, driven by season, feed prices and promotions. Each product's history tells you whether today's price is high or low compared with last month.\n\n## Availability\n\nOnline prices apply in Tegucigalpa, San Pedro Sula, La Ceiba, Choluteca, Danlí and nationwide; availability varies by branch and each product page shows it.\n\n### How much is a carton of eggs in Honduras?\n\nOn this page, sorted by lowest price, with each store's figure updated several times a day.",
    "keywords": ["egg prices honduras", "carton of eggs price honduras", "eggs honduras"]
  }
}
```

## Lo que tenés que generar

Te voy a pedir **un grupo por mensaje**. Cada grupo es una categoría raíz con TODAS sus subcategorías; devolvé el array con la raíz primero y luego sus hijas, en este orden. Los slugs van exactos.

### Grupo 04 — `04-limpieza.json`
- Raíz: **Limpieza del Hogar** · slug `limpieza-del-hogar`
- Hijas: Detergentes y Suavizantes `detergentes-suavizantes` · Lavaplatos y Desengrasantes `lavaplatos-desengrasantes` · Limpiadores de Superficies y Desinfectantes `limpiadores-desinfectantes` · Papel Higiénico, Servilletas y Toallas `papel-higienico-servilletas` · Utensilios de Limpieza `utensilios-limpieza` · Insecticidas y Ambientadores `insecticidas-ambientadores`

### Grupo 05 — `05-higiene-belleza.json`
- Raíz: **Higiene y Belleza** · slug `higiene-y-belleza`
- Hijas: Cuidado del Cabello `cuidado-del-cabello` · Cuidado Bucal `cuidado-bucal` · Jabones, Geles y Baño `jabones-geles-bano` · Desodorantes y Antitranspirantes `desodorantes-antitranspirantes` · Cuidado Facial y Corporal `cuidado-facial-corporal` · Afeitado y Depilación `afeitado-depilacion` · Higiene Femenina `higiene-femenina` · Maquillaje y Cosmetología `maquillaje-cosmetologia`

### Grupo 06 — `06-farmacia.json`
- Raíz: **Farmacia y Cuidado de la Salud** · slug `farmacia-y-salud`
- Hijas: Analgésicos y Antiinflamatorios `analgesicos-antiinflamatorios` · Gripe, Tos y Resfriado `gripe-tos-resfriado` · Salud Digestiva y Estomacal `salud-digestiva` · Vitaminas y Suplementos `vitaminas-suplementos` · Primeros Auxilios y Botiquín `primeros-auxilios`
- Nota: no des consejos médicos ni dosis; hablá de precios, presentaciones y marcas. Recordá «consultá a tu médico o farmacéutico».

### Grupo 07 — `07-bebes.json`
- Raíz: **Bebés y Niños** · slug `bebes-y-ninos`
- Hijas: Pañales y Toallitas Húmedas `panales-toallitas-humedas` · Alimentación Infantil y Fórmulas `alimentacion-infantil-formulas` · Cuidado e Higiene del Bebé `cuidado-higiene-bebe` · Biberones, Chupones y Accesorios `biberones-chupones-accesorios` · Puericultura, Coches y Sillas `puericultura-coches-sillas`

### Grupo 08 — `08-hogar.json`
- Raíz: **Artículos para el Hogar** · slug `articulos-para-el-hogar`
- Hijas: Accesorios para Cocina y Repostería `accesorios-para-cocina` · Camas, Colchones y Blancos `camas-colchones-blancos` · Organización y Almacenamiento `organizacion-almacenamiento` · Decoración, Iluminación y Muebles `decoracion-muebles` · Accesorios para Mesa y Vajillas `accesorios-mesa-vajillas`

### Grupo 09 — `09-electronica.json`
- Raíz: **Electrónica y Electrodomésticos** · slug `electronica-electrodomesticos`
- Hijas: Televisores y Audio `televisores-audio` · Computación y Accesorios `computacion-accesorios` · Teléfonos y Celulares `telefonos-celulares` · Electrodomésticos de Cocina `electrodomesticos-cocina` · Línea Blanca `linea-blanca` · Consolas de Videojuegos `consolas-de-videojuegos` · Videojuegos `videojuegos` · Códigos Digitales `codigos-digitales`

### Grupo 10 — `10-jugueteria.json`
- Raíz: **Juguetería y Juegos** · slug `jugueteria-y-juegos`
- Hijas: Juguetes de Bebés y Estimulación `juguetes-bebes-estimulacion` · Juguetes Educativos y Didácticos `juguetes-educativos` · Muñecas, Figuras y Vehículos `munecas-figuras-vehiculos` · Juegos de Mesa y Rompecabezas `juegos-de-mesa-rompecabezas` · Juguetes Exterior y Aire Libre `juguetes-exterior-aire-libre`

### Grupo 11 — `11-ferreteria.json`
- Raíz: **Ferretería y Automotriz** · slug `ferreteria-y-automotriz`
- Hijas: Herramientas Manuales y Eléctricas `herramientas-manuales-electricas` · Pintura y Brochas `pintura-brochas` · Accesorios y Cuidado para Autos `accesorios-cuidado-autos` · Electricidad y Plomería `electricidad-plomeria` · Motos y Cuatrimotos `motos-y-cuatrimotos` · Repuestos y Mantenimiento de Equipos `repuestos-y-mantenimiento`

### Grupo 12 — `12-mascotas.json`
- Raíz: **Mascotas** · slug `mascotas`
- Hijas: Alimento para Perros `alimento-para-perros` · Alimento para Gatos `alimento-para-gatos` · Juguetes y Accesorios para Mascotas `juguetes-accesorios-mascotas` · Higiene y Cuidado de Mascotas `higiene-cuidado-mascotas`

### Grupo 13 — `13-libreria.json`
- Raíz: **Librería y Papelería** · slug `libreria-y-papelera` (ojo: el slug es «papelera», tal cual)
- Hijas: Útiles Escolares y de Oficina `utiles-escolares-oficina` · Cuadernos, Libretas y Hojas `cuadernos-libretas-hojas` · Escritura y Corrección `escritura-correccion` · Arte y Manualidades `arte-manualidades`

### Grupo 14 — `14-ropa.json`
- Raíz: **Ropa y Moda** · slug `ropa-y-moda`
- Hijas: Ropa Masculina `ropa-masculina` · Ropa Femenina `ropa-femenina` · Ropa Infantil `ropa-infantil` · Ropa Deportiva `ropa-deportiva` · Ropa Interior y Pijamas `ropa-interior-y-pijamas` · Trajes de Baño y Playa `trajes-de-bano` · Básicos y Algodón `basicos-y-algodon`

### Grupo 15 — `15-calzado-accesorios.json`
- Raíz: **Calzado** · slug `calzado` · Hijas: Calzado Masculino `calzado-masculino` · Calzado Femenino `calzado-femenino` · Tenis y Deportivo `tenis-y-deportivo`
- Raíz: **Accesorios de Moda** · slug `accesorios-de-moda` · Hijas: Bolsos, Mochilas y Billeteras `bolsos-mochilas-y-billeteras` · Relojes y Joyería `relojes-y-joyeria` · Lentes y Gorras `lentes-y-gorras` · Bandas de Actividad y Smartwatches `bandas-actividad-y-smartwatches`

### Grupo 16 — `16-deportes-viaje.json`
- Raíz: **Deportes, Fitness y Ejercicio** · slug `deportes-y-fitness` · Hijas: Máquinas de Cardio y Gimnasio `maquinas-cardio-gimnasio` · Pesas y Equipos de Fuerza `pesas-y-equipos-de-fuerza` · Accesorios Fitness y Ejercicio `accesorios-fitness-y-ejercicio` · Disciplinas Deportivas `disciplinas-deportivas` · Bicicletas y Ciclismo `ciclismo-y-bicicletas`
- Raíz: **Equipaje, Maletas y Viaje** · slug `equipaje-y-viaje` · Hijas: Maletas y Equipaje de Viaje `maletas-y-equipaje` · Bolsos Deportivos y Maletines `bolsos-deportivos-y-maletines`

### Grupo 17 — `17-temporada-gaming-comercio.json`
- Raíz: **De temporada** · slug `de-temporada` · Hijas: Navidad `navidad` · Halloween `halloween` · Liquidación `liquidacion` · Curiosidades `curiosidades`
- Raíz: **Gaming** · slug `gaming` · Hijas: Playstation `playstation` · Xbox `xbox` · Nintendo `nintendo`
- Raíz: **Publicidad, Rotulación y Comercio** · slug `publicidad-y-comercio` · Hijas: Rotulación y Soportes Publicitarios `rotulacion-y-exhibicion` · Artículos Promocionales y de Impulso `articulos-promocionales-e-impulso`

Empezá con el **Grupo 04**. Cuando te diga «siguiente», seguí con el próximo grupo en orden.
