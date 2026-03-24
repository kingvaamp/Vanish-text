// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Guard — crash explicite si les variables manquent
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[VanishText] EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
    'sont requis. Vérifie ton fichier .env.local'
  );
}

// Validation format URL
if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
  throw new Error('[VanishText] EXPO_PUBLIC_SUPABASE_URL invalide');
}

const storage = Platform.OS === 'web'
  ? (typeof window !== 'undefined' ? window.localStorage : null)
  : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Health check silencieux au démarrage
supabase.from('profiles').select('count').limit(1).then(({ error }) => {
  if (error) console.warn('[Supabase] Connexion dégradée :', error.message);
  else       console.log('[Supabase] ✓ Connecté');
});
