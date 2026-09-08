/**
 * Sustituto de `server-only` para las pruebas.
 *
 * El paquete real lanza cuando se importa desde un bundle de cliente, y el
 * entorno jsdom de Vitest cuenta como tal. La frontera servidor/cliente la
 * sigue haciendo cumplir `next build`, que es donde importa.
 */
export {};
