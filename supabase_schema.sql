-- 🚀 VANISHTEXT SUPABASE E2E SCHEMA 🚀
-- Veuillez exécuter ce script dans le SQL Editor de votre projet Supabase.

-- 1. Table des Profils (Annuaire PKI)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  public_key TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Les profils et clés publiques sont visibles par tous les utilisateurs connectés
CREATE POLICY "Public profiles reading" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
-- Les utilisateurs peuvent mettre à jour leur PROPRE profil (et leur propre clé)
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- 2. Table des Messages Chiffrés (N-Way Payloads)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertexts JSONB NOT NULL,
  cid TEXT, -- L'identifiant du "salon" arbitraire ou contact mocké (ex: c1, c2)
  read_at TIMESTAMP WITH TIME ZONE, -- Heure à laquelle le premier destinataire a déchiffré le message
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index pour accélérer la suppression des messages expirés par le "Reaper"
CREATE INDEX idx_messages_read_at ON public.messages(read_at);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs connectés peuvent insérer un message
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Les utilisateurs connectés peuvent lire les messages (le vrai filtre se fait au déchiffrement mathématique local)
CREATE POLICY "Authenticated users can read messages" ON public.messages FOR SELECT USING (auth.role() = 'authenticated');


-- 3. Fonction pour mettre à jour automatiquement le "updated_at"
create extension if not exists moddatetime schema extensions;
create trigger handle_updated_at before update on profiles
  for each row execute procedure moddatetime (updated_at);
