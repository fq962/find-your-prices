/**
 * Wrapper mínimo sobre fetch para llamadas a APIs externas o internas.
 * Centraliza manejo de errores y parseo JSON; amplíalo con auth/headers
 * cuando se defina el backend (proveedor de precios, base de datos, etc.).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  input: string | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.statusText}`, res.status);
  }

  return res.json() as Promise<T>;
}
