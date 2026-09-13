import { type SupabaseClient, createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anon);

if (!isSupabaseConfigured) {
  console.error(
    '[supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (proyecto Lifty wabdd…).',
  );
}

export const supabase: SupabaseClient = createClient(
  url || 'https://example.supabase.co',
  anon || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder',
);
