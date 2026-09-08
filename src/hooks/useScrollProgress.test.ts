import { afterEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  computeScrollProgress,
  SCROLL_PROGRESS_PROPERTY,
  useScrollProgress,
} from "./useScrollProgress";

/**
 * `computeScrollProgress` es la parte con aritmética y se prueba sola. Del
 * hook se prueba el cableado: que escriba la custom property al montar, que
 * reaccione al scroll y que limpie lo que dejó.
 */

function setViewport({
  scrollY,
  documentHeight,
  viewportHeight,
}: {
  scrollY: number;
  documentHeight: number;
  viewportHeight: number;
}) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: viewportHeight, configurable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: documentHeight,
    configurable: true,
  });
}

function readProperty(): string {
  return document.documentElement.style.getPropertyValue(SCROLL_PROGRESS_PROPERTY);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(SCROLL_PROGRESS_PROPERTY);
});

describe("computeScrollProgress", () => {
  test("arriba del todo es 0 y abajo del todo es 1", () => {
    expect(computeScrollProgress(0, 2000, 800)).toBe(0);
    expect(computeScrollProgress(1200, 2000, 800)).toBe(1);
  });

  test("a mitad del recorrido scrollable es 0.5 (no la mitad del documento)", () => {
    // El recorrido es scrollHeight - viewport = 1200, no 2000.
    expect(computeScrollProgress(600, 2000, 800)).toBe(0.5);
  });

  test("acota fuera de rango en vez de devolver valores imposibles", () => {
    // Los rebotes de scroll (iOS) y los desbordes reportan valores fuera de
    // rango; la barra nunca debe pasarse ni invertirse.
    expect(computeScrollProgress(-120, 2000, 800)).toBe(0);
    expect(computeScrollProgress(99999, 2000, 800)).toBe(1);
  });

  test("un documento que no desborda no tiene avance: 0, sin dividir por cero", () => {
    expect(computeScrollProgress(0, 700, 800)).toBe(0);
    expect(computeScrollProgress(0, 800, 800)).toBe(0);
    expect(Number.isFinite(computeScrollProgress(50, 800, 800))).toBe(true);
  });
});

describe("useScrollProgress", () => {
  test("publica el avance en <html> ya al montar, sin esperar a que el usuario scrollee", () => {
    setViewport({ scrollY: 300, documentHeight: 2000, viewportHeight: 800 });

    renderHook(() => useScrollProgress());

    expect(readProperty()).toBe("0.2500");
  });

  test("actualiza el valor cuando la página se desplaza", () => {
    setViewport({ scrollY: 0, documentHeight: 2000, viewportHeight: 800 });
    // rAF síncrono: el hook agenda el cálculo en un frame y en jsdom no hay
    // frames de verdad que esperar.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    renderHook(() => useScrollProgress());
    expect(readProperty()).toBe("0.0000");

    setViewport({ scrollY: 900, documentHeight: 2000, viewportHeight: 800 });
    window.dispatchEvent(new Event("scroll"));

    expect(readProperty()).toBe("0.7500");
  });

  test("recalcula al cambiar el tamaño de la ventana: el recorrido depende del viewport", () => {
    setViewport({ scrollY: 600, documentHeight: 2000, viewportHeight: 800 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    renderHook(() => useScrollProgress());
    expect(readProperty()).toBe("0.5000");

    setViewport({ scrollY: 600, documentHeight: 2000, viewportHeight: 1400 });
    window.dispatchEvent(new Event("resize"));

    expect(readProperty()).toBe("1.0000");
  });

  test("al desmontar deja de escuchar y quita la propiedad que había puesto", () => {
    setViewport({ scrollY: 300, documentHeight: 2000, viewportHeight: 800 });
    const removeListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useScrollProgress());
    expect(readProperty()).toBe("0.2500");

    unmount();

    expect(readProperty()).toBe("");
    const removed = removeListener.mock.calls.map(([event]) => event);
    expect(removed).toContain("scroll");
    expect(removed).toContain("resize");
  });

  test("un solo frame agendado por ráfaga de eventos, por más scroll que llegue", () => {
    setViewport({ scrollY: 0, documentHeight: 2000, viewportHeight: 800 });
    // Sin ejecutar el callback: así se ve cuántos frames se agendaron.
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 7);

    renderHook(() => useScrollProgress());

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));

    expect(raf).toHaveBeenCalledTimes(1);
  });
});
