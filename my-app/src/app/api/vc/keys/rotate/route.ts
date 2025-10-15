import { withRole, success } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { ProductionKeyManager } from '../../../../../../lib/vc/productionKeyManager';

// POST /api/vc/keys/rotate - admin only
export const POST = withRole(['admin'], async (_req, { user }) => {
  const km = ProductionKeyManager.getInstance();
  const newKey = await km.rotateKey();

  // Audit
  const supabase = await createSupabaseServerClient();
  try {
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'vc_key_rotate',
      target_id: newKey.kid,
      details: { alg: newKey.alg },
      created_at: new Date().toISOString(),
    });
  } catch (auditError) {
    console.error('Audit log error:', auditError);
  }

  return success({ success: true, keyId: newKey.kid });
});



