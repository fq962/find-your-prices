import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El panel sube imágenes de categoría (hasta 5 MB) por server action;
      // el tope por defecto es 1 MB. Con margen para el sobre de multipart.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
