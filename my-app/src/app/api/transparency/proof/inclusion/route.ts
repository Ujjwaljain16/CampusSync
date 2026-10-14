import { runTlogRoute, parseUintParam, CACHE } from '../../_shared';
import { TlogError, getInclusionProof } from '@/lib/transparencyLog';

// PUBLIC: Merkle audit path for one entry. ?index=N[&treeSize=M] (treeSize defaults to the latest head).
export async function GET(request: Request) {
  return runTlogRoute(request, 'inclusion', async (db, url) => {
    const index = parseUintParam(url.searchParams.get('index'));
    if (index === null) throw new TlogError('bad_request', 'index must be a non-negative integer');
    const rawSize = url.searchParams.get('treeSize');
    const treeSize = rawSize === null ? undefined : parseUintParam(rawSize);
    if (treeSize === null) throw new TlogError('bad_request', 'treeSize must be a positive integer');
    if (treeSize !== undefined && (treeSize < 1 || index >= treeSize)) {
      throw new TlogError('bad_request', 'treeSize must be positive and greater than index');
    }
    const body = await getInclusionProof(db, index, treeSize);
    return { body, cache: treeSize === undefined ? CACHE.head : CACHE.immutable };
  });
}
