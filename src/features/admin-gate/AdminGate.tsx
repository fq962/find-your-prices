'use client';

import { useActionState } from 'react';
import { unlockAdmin, type UnlockState } from '@/app/(es)/admin/actions';

const initialState: UnlockState = { error: null };

/** Pantalla de bloqueo del panel: pide la clave (CRON_SECRET) y nada mas. */
export function AdminGate() {
  const [state, action, pending] = useActionState(unlockAdmin, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <form action={action} className="w-full max-w-sm">
        <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
          Administración
        </p>
        <h1 className="mt-3 text-2xl font-medium text-[var(--text)]">Panel bloqueado</h1>
        <p className="mt-2 text-[0.9375rem] text-[var(--text-secondary)]">
          Ingresá la clave para entrar.
        </p>

        <label className="mt-8 block">
          <span className="text-[0.75rem] text-[var(--text-tertiary)]">Clave</span>
          <input
            name="secret"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="w-full border-0 border-b border-[var(--border-strong)] bg-transparent px-0 py-2 font-mono text-[0.9375rem] text-[var(--text)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] focus:border-[var(--accent)]"
          />
        </label>

        {state.error && (
          <p role="alert" className="mt-3 text-[0.8125rem] text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-8 rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
        >
          {pending ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
