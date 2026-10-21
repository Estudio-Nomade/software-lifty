import './cryptoPolyfill';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
// Prefer legacy anon JWT when present — some Expo Go / older clients mishandle
// sb_publishable_* keys and hang on getSession (Android splash stuck).
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native apps never see the OAuth redirect as a browser URL; the session is
    // resolved manually from the deep link (see lib/socialAuth.ts).
    detectSessionInUrl: false,
    // PKCE is required for the native OAuth (Google / Apple) redirect flow.
    flowType: 'pkce',
  },
});

// Supabase needs the app foreground state to drive token auto-refresh.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
