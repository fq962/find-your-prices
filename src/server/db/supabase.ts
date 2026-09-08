import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Clientes de Supabase para uso EXCLUSIVO en el servidor.
 *
 * Todo el proyecto vive en el esquema `find_your_prices`, no en `public`, asi
 * que el cliente se crea siempre con `db.schema`. Para que PostgREST lo acepte
 * hay que exponerlo en Supabase -> Settings -> API -> Exposed schemas.
 */

export const DB_SCHEMA = 'find_your_prices';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiala desde .env.example a .env.local.`,
    );
  }
  return value;
}

// El tipo se infiere de createClient para conservar el esquema find_your_prices
// en la firma; escribirlo a mano lo colapsaria a 'public'.
type SchemaClient = ReturnType<typeof createSchemaClient>;

function createSchemaClient(url: string, key: string, persistSession: boolean) {
  return createClient(url, key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession, autoRefreshToken: false },
  });
}

let adminClient: SchemaClient | null = null;

/**
 * Cliente con service role: ignora RLS y puede escribir. Solo para route
 * handlers, server actions y el runner de scraping. Nunca en un componente
 * cliente.
 */
export function getSupabaseAdmin(): SchemaClient {
  if (adminClient) return adminClient;

  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  // Las llaves nuevas (sb_secret_...) y las clasicas (service_role JWT) sirven
  // igual; se acepta cualquiera de las dos para no atar el proyecto a un formato.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_SECRET;
  if (!key) {
    throw new Error(
      'Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_SECRET) para operar con permisos de servidor.',
    );
  }

  adminClient = createSchemaClient(url, key, false);

  return adminClient;
}

let publicClient: SchemaClient | null = null;

/** Cliente de solo lectura sujeto a RLS. Para el catalogo publico. */
export function getSupabasePublic(): SchemaClient {
  if (publicClient) return publicClient;

  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('Falta SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY).');
  }

  publicClient = createSchemaClient(url, key, false);

  return publicClient;
}
