import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { ServiceUnavailableError } from '../../../shared/lib/errors';

let adminClient: SupabaseClient | null = null;
let passwordClient: SupabaseClient | null = null;

/** Service-role client for Auth Admin API only. Never expose to browser. */
export function getAuthAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ServiceUnavailableError(
      'Auth Admin no configurado (SUPABASE_URL + SUPABASE_SECRET_KEY)',
    );
  }

  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/**
 * Anon/publishable client to verify password grants the same way panels do.
 * Prefer publishable; fall back to secret only in constrained test envs.
 */
export function getAuthPasswordClient(): SupabaseClient {
  if (passwordClient) return passwordClient;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ServiceUnavailableError(
      'Auth password client no configurado (SUPABASE_URL + PUBLISHABLE/ANON key)',
    );
  }

  passwordClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return passwordClient;
}

/** Test hook: inject mock / clear singleton. */
export function setAuthAdminClientForTests(client: SupabaseClient | null) {
  adminClient = client;
  // In tests the mock is also used for password verify when publishable is absent.
  passwordClient = client;
}

export function setAuthPasswordClientForTests(client: SupabaseClient | null) {
  passwordClient = client;
}
