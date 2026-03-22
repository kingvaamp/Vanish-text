import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ⚠️ REMPLACEZ CES VALEURS PAR CELLES DE VOTRE DASHBOARD SUPABASE ⚠️
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://snrsicctfqunkamsgfbu.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_3dhOIzOf9mRETAkwlLTgnA_bWlLqqlM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Isomorphique: Web utilise localStorage nativement, iOS/Android utilisent AsyncStorage
    storage: Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.localStorage : null) : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Très important pour l'OAuth web!
  },
});
