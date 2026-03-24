// supabase/functions/cleanup-expired-messages/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (_req) => {
  try {
    const { error, count } = await supabase
      .from('messages')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);

    if (error) {
      console.error('[Cleanup] Erreur :', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(`[Cleanup] ${count ?? 0} messages expirés supprimés`);
    return new Response(
      JSON.stringify({ deleted: count ?? 0, timestamp: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
