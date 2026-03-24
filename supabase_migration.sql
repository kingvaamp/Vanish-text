-- VanishText — Migration SQL pour suppression réelle des messages
-- À exécuter dans Supabase Dashboard → SQL Editor

-- 1. Ajouter expires_at aux messages (si absent)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ;

-- Index pour les requêtes de nettoyage
CREATE INDEX IF NOT EXISTS idx_messages_expires
  ON messages(expires_at)
  WHERE expires_at IS NOT NULL;

-- 2. Permettre aux destinataires de mettre à jour read_at et expires_at
DROP POLICY IF EXISTS "Users can update read_at" ON messages;
CREATE POLICY "Recipient can mark message as read"
  ON messages FOR UPDATE
  USING  (ciphertexts ? auth.uid()::text)
  WITH CHECK (ciphertexts ? auth.uid()::text);

-- 3. Fonction de purge des messages expirés
CREATE OR REPLACE FUNCTION public.purge_vanished_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.messages
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Planifier la purge automatique (si pg_cron est disponible)
-- SELECT cron.schedule('vanish-reaper', '*/1 * * * *', 'SELECT purge_vanished_messages()');
