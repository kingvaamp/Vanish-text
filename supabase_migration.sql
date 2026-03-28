-- ============================================================
--  VANISHTEXT — MIGRATION PATCH
--  Run this ONLY if you already executed supabase_schema.sql
--  (i.e. the messages table exists). Otherwise run the full schema.
-- ============================================================

-- BUG 4 FIX: add expires_at column (previously missing, Reaper updates failed silently)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON public.messages(expires_at);

-- BUG 8 FIX: add DELETE RLS policy so the Reaper can remove expired messages
-- (previously there was no DELETE policy — delete() returned 0 rows silently)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages'
    AND policyname = 'Users can delete intended messages'
  ) THEN
    CREATE POLICY "Users can delete intended messages" ON public.messages
      FOR DELETE USING (
        ciphertexts ? auth.uid()::text
      );
  END IF;
END $$;
