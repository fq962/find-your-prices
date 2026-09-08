import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRevealRef } from "./useRevealRef";

/**
 * El reveal no debe poder esconder contenido: si el navegador no trae
 * IntersectionObserver, o el usuario pidió menos movimiento, el nodo tiene
 * que quedar revelado de entrada. Eso es lo que más se prueba acá.
 */

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

interface FakeObserver {
  callback: ObserverCallback;
  observed: Element[];
  disconnected: number;
}

const created: FakeObserver[] = [];

function installObserver() {
  class FakeIntersectionObserver {
    private readonly self: FakeObserver;

    constructor(callback: ObserverCallback) {
      this.self = { callback, observed: [], disconnected: 0 };
      created.push(this.self);
    }

    observe(element: Element) {
      this.self.observed.push(element);
    }

    disconnect() {
      this.self.disconnected += 1;
    }

    unobserve() {}
  }

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}

function Subject() {
  const revealRef = useRevealRef();
  return <div ref={revealRef} className="reveal" data-testid="subject" />;
}

afterEach(() => {
  created.length = 0;
  // El mock de matchMedia de un test no debe decidir el comportamiento del
  // siguiente: sin esto, "reduced motion" contagia a los que vienen después.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useRevealRef", () => {
  test("el nodo arranca sin revelar y se revela al entrar en viewport", () => {
    installObserver();

    render(<Subject />);
    const subject = screen.getByTestId("subject");

    expect(subject).not.toHaveAttribute("data-revealed");
    expect(created).toHaveLength(1);
    expect(created[0].observed).toContain(subject);

    created[0].callback([{ isIntersecting: true }]);

    expect(subject).toHaveAttribute("data-revealed", "true");
  });

  test("no se revela mientras el elemento no intersecte", () => {
    installObserver();

    render(<Subject />);

    created[0].callback([{ isIntersecting: false }]);

    expect(screen.getByTestId("subject")).not.toHaveAttribute("data-revealed");
  });

  test("deja de observar en cuanto revela: es de una sola vez", () => {
    installObserver();

    render(<Subject />);
    created[0].callback([{ isIntersecting: true }]);

    expect(created[0].disconnected).toBeGreaterThan(0);
  });

  test("sin IntersectionObserver el contenido se muestra igual", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<Subject />);

    expect(screen.getByTestId("subject")).toHaveAttribute("data-revealed", "true");
  });

  test("con prefers-reduced-motion no hay reveal: el nodo nace visible", () => {
    installObserver();
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);

    render(<Subject />);

    expect(screen.getByTestId("subject")).toHaveAttribute("data-revealed", "true");
    // No se llegó a crear observer alguno para este render.
    expect(created).toHaveLength(0);
  });

  test("al desmontar desconecta el observer", () => {
    installObserver();

    const { unmount } = render(<Subject />);
    unmount();

    expect(created[0].disconnected).toBeGreaterThan(0);
  });
});
