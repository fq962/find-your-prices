This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Estructura del proyecto

```
src/
  app/            # Solo enrutamiento (App Router): layout, page, route handlers
    api/          # Route handlers (endpoints propios)
  components/
    ui/           # Primitivas de diseño reutilizables (Button, Input, Card...)
    layout/       # Header, Footer, Shell y demás piezas estructurales
    shared/       # Componentes compuestos usados por más de una feature
  features/       # Módulos de negocio autocontenidos (ver features/README.md)
  hooks/          # Hooks compartidos por toda la app
  lib/            # Utilidades sin estado: formato, constantes, cliente API, validaciones
  server/         # Código exclusivo de servidor: db, services, server actions
  types/          # Tipos TypeScript compartidos globalmente
  config/         # Configuración de sitio/app (metadata, flags...)
public/
  images/         # Imágenes estáticas
  icons/          # Iconos estáticos
```

Reglas rápidas:
- Si algo lo usa una sola feature, vive dentro de `features/<feature>/`; si lo usa más de una, sube a `components/shared` o `lib/`.
- `server/` nunca se importa desde componentes cliente.
- El alias `@/*` apunta a `src/*` (ver `tsconfig.json`).

## Scraping

El sistema rastrea precios de tiendas hondureñas. Está diseñado para escalar a
miles de sitios: agregar un comercio **no toca la base de datos ni el runner**.

### Piezas

```
src/server/scraping/
  types.ts          # Contrato: ScrapeStrategy + NormalizedProduct
  registry.ts       # Registro de estrategias (agregar la tienda nueva aquí)
  http.ts           # Cliente HTTP: reintentos, timeout, cortesía, telemetría
  runner.ts         # Orquesta una corrida: bitácora, hash, ingesta, bajas
  repository.ts     # Acceso a datos (Supabase)
  strategies/
    diunsa.ts       # Primera tienda
  README.md         # ← Manual para agregar una tienda nueva
src/app/api/scraping/
  run/              # Endpoint del cron
  targets/          # CRUD del panel
  stores/ runs/ strategies/
src/app/(es)/admin/scraping/   # Panel web
src/db/migrations/             # SQL para Supabase
src/db/docs/documentation.md   # Documentación del esquema
```

### Cron

```
GET https://tu-dominio.com/api/scraping/run?secret=$CRON_SECRET
```

Corre todos los targets vencidos (`next_run_at <= now()`). Sin `CRON_SECRET`
configurado el endpoint responde 401: un scraper abierto a internet es un ataque
de denegación de servicio gratis contra las tiendas que rastreamos.

### Agregar una tienda

> **Manual completo: [`src/server/scraping/README.md`](src/server/scraping/README.md).**
> Está escrito para que un agente lo siga de punta a punta: cómo detectar si un
> sitio es SSR o SPA, cómo encontrar la API que hay detrás, el contrato de datos,
> las trampas concretas y la verificación que de verdad prueba que funciona.

1. Implementar `ScrapeStrategy` en `src/server/scraping/strategies/<tienda>.ts`.
2. Registrarla en `registry.ts`.
3. Dar de alta la tienda (`POST /api/scraping/stores`) con esa `strategy_key`.
4. Registrar sus targets desde `/admin/scraping`.

Nada de eso toca la base de datos, el runner, el endpoint ni el panel.

### Diunsa

diunsa.hn es una SPA de Angular: el HTML del servidor son esqueletos de carga y
los productos los pinta el navegador contra una API JSON. Por eso la estrategia
consume esa API en vez de parsear HTML — es más rápida, más estable y trae campos
que la tarjeta visual no muestra (código de barras, stock, impuesto, ficha
técnica, garantías, galería completa).

Medido contra producción: **catálogo completo = 8 083 artículos en 18 peticiones
y ~49 s**. Una segunda corrida sin cambios reales tarda ~6 s y no escribe nada,
gracias al hash de contenido.

Para revalidar el contrato cuando Diunsa cambie algo:

```bash
SCRAPER_LIVE_TESTS=1 npx vitest run src/server/scraping/strategies/diunsa.live.test.ts
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

Este proyecto usa [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) para cargar Space Grotesk (display y UI) e Instrument Serif (la línea editorial del hero).

## Idiomas

El idioma vive en la URL: `/` sirve español (default del sitio, sin prefijo) y `/en` sirve inglés. Cada ruta tiene su propio root layout (`src/app/(es)/layout.tsx` y `src/app/en/layout.tsx`) para que `<html lang>` sea correcto ya en el HTML del servidor.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
