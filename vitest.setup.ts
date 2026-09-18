import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  installMatchMediaMock,
  resetMatchMediaMocks,
} from "./src/test/matchMedia";

// Las pruebas que declaran `@vitest-environment node` (las live del scraper,
// que necesitan el WebSocket real de Node) no tienen `window`: nada que limpiar.
const hasDom = typeof window !== "undefined";

if (hasDom) installMatchMediaMock();

afterEach(() => {
  if (!hasDom) return;
  cleanup();
  resetMatchMediaMocks();
  window.localStorage.clear();
});
