// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ubjsgwpxkcxdpgfsfyjg.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable__0XmvmW-jjp1VpITIOOe_w_UHKePy78';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[VanishText] EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY manquants. ' +
    'Vérifiez les variables d\'environnement dans Render Dashboard (Build ENV vars).'
  );
}

const storage = Platform.OS === 'web'
  ? (typeof window !== 'undefined' ? window.localStorage : null)
  : AsyncStorage;

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

// Health check silencieux
if (supabaseUrl && supabaseAnonKey) {
  supabase.from('profiles').select('count').limit(1).then(({ error }) => {
    if (error) console.warn('[Supabase] Connexion dégradée :', error.message);
    else       console.log('[Supabase] ✓ Connecté');
  });
}
