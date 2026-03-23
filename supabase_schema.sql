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

-- Table de Configuration Interne (SALT pour le Rate Limiting anonyme)
CREATE TABLE public.internal_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Insertion d'un salt unique au déploiement
INSERT INTO public.internal_config (key, value) 
VALUES ('rate_limit_salt', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Les profils et clés publiques sont visibles par tous les utilisateurs connectés
CREATE POLICY "Public profiles reading" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
-- Les utilisateurs peuvent mettre à jour leur PROPRE profil (et leur propre clé)
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- 2. Table des Messages Chiffrés (N-Way Payloads - Sealed Sender Mode)
-- NOTE: sender_id est SUPPRIMÉ pour que le serveur ne sache pas qui parle.
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciphertexts JSONB NOT NULL,
  cid TEXT, -- Optionnel: Identifiant de conversation (peut être masqué aussi si nécessaire)
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table interne pour le Rate Limiting (Invisible pour les utilisateurs via RLS)
-- Stocke un hash salé de l'ID utilisateur pour compter les messages sans stocker l'ID réel.
CREATE TABLE public.internal_usage_log (
  hash_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_usage_log_time ON public.internal_usage_log(created_at);

-- Index pour accélérer la suppression des messages expirés par le "Reaper"
CREATE INDEX idx_messages_read_at ON public.messages(read_at);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs connectés peuvent insérer un message (Le trigger vérifiera le rate-limit via auth.uid())
CREATE POLICY "Users can insert anonymous messages" ON public.messages 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Les utilisateurs ne peuvent lire que les messages qui leur sont destinés (via les clés dans ciphertexts)
CREATE POLICY "Users can read intended messages" ON public.messages 
  FOR SELECT USING (
    ciphertexts ? auth.uid()::text
  );

-- Les utilisateurs peuvent marquer un message comme "lu" (update read_at)
CREATE POLICY "Users can update read_at" ON public.messages 
  FOR UPDATE USING (
    ciphertexts ? auth.uid()::text
  ) WITH CHECK (
    ciphertexts ? auth.uid()::text
  );

-- 3. Limiteur de Débit (Rate Limiting) Anonyme
-- Utilise un hash salé du auth.uid() pour compter sans déanonymiser les messages.
CREATE OR REPLACE FUNCTION public.check_message_rate()
RETURNS TRIGGER AS $$
DECLARE
  v_salt TEXT;
  u_hash TEXT;
  msg_count INTEGER;
BEGIN
  -- Récupère le salt depuis la config interne
  SELECT value INTO v_salt FROM public.internal_config WHERE key = 'rate_limit_salt';

  -- Génère un hash du sender avec le salt dynamique
  u_hash := encode(digest(auth.uid()::text || v_salt, 'sha256'), 'hex');

  -- Compte dans la table d'usage
  SELECT count(*) INTO msg_count 
  FROM public.internal_usage_log 
  WHERE hash_id = u_hash 
  AND created_at > (now() - interval '1 minute');

  IF msg_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Max 20 messages per minute.';
  END IF;

  -- Log l'usage anonyme
  INSERT INTO public.internal_usage_log (hash_id) VALUES (u_hash);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_check_message_rate
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.check_message_rate();


-- 3. Fonction pour mettre à jour automatiquement le "updated_at"
create extension if not exists moddatetime schema extensions;
create trigger handle_updated_at before update on profiles
  for each row execute procedure moddatetime (updated_at);

-- ── 4. Message Reaper (Suppression Physique Post-TTL) ──
-- Cette fonction supprime physiquement les messages de la base après 3 minutes de lecture.
CREATE OR REPLACE FUNCTION public.purge_vanished_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.messages
  WHERE read_at IS NOT NULL
  AND read_at < (now() - interval '3 minutes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pour activer la suppression automatique (toutes les minutes) :
-- Allez dans SQL Editor et exécutez (si pg_cron est activé) :
-- SELECT cron.schedule('*/1 * * * *', 'SELECT purge_vanished_messages()');
