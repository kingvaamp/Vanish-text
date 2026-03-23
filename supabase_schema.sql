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

-- Les utilisateurs connectés peuvent insérer un message UNIQUEMENT en leur nom propre (Anti-Spoofing)
CREATE POLICY "Users can insert their own messages" ON public.messages 
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Les utilisateurs ne peuvent lire que les messages qu'ils ont envoyés ou dont ils sont destinataires
-- Note: Pour un anonymat maximal, on pourrait laisser SELECT public, mais restreindre ici ajoute une couche de sécurité.
CREATE POLICY "Users can read own context messages" ON public.messages 
  FOR SELECT USING (
    auth.uid() = sender_id OR 
    ciphertexts ? auth.uid()::text
  );

-- 3. Limiteur de Débit (Rate Limiting) côté Serveur
-- Empêche un utilisateur de spammer la base de données (max 20 msg / min)
CREATE OR REPLACE FUNCTION public.check_message_rate()
RETURNS TRIGGER AS $$
DECLARE
  msg_count INTEGER;
BEGIN
  SELECT count(*) INTO msg_count 
  FROM public.messages 
  WHERE sender_id = auth.uid() 
  AND created_at > (now() - interval '1 minute');

  IF msg_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Max 20 messages per minute.';
  END IF;
  
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
