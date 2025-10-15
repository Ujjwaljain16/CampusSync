import { withRole, success } from '@/lib/api';
import { ProductionKeyManager } from '../../../../../../lib/vc/productionKeyManager';

// GET /api/vc/keys/current - admin only
export const GET = withRole(['admin'], async () => {
  const km = ProductionKeyManager.getInstance();
  const current = km.getCurrentKey();
  const meta = km.getKeyMetadata();
  
  return success({
    currentKeyId: current?.kid || null,
    algorithm: current?.alg || null,
    use: current?.use || null,
    keys: meta
  });
});



