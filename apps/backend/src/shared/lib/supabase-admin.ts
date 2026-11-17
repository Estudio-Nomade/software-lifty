import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { ServiceUnavailableError } from './errors';

let adminClient: SupabaseClient | null = null;

/** Service-role client for Auth Admin + Storage Admin. Never expose to clients. */
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ServiceUnavailableError(
      'Supabase Admin no configurado (SUPABASE_URL + SUPABASE_SECRET_KEY)',
    );
  }

  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/** Test hook: inject mock / clear singleton. */
export function setSupabaseAdminClientForTests(client: SupabaseClient | null) {
  adminClient = client;
}
