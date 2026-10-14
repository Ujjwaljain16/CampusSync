import { runTlogRoute, parseUintParam, CACHE } from '../../_shared';
import { TlogError, getConsistencyProof } from '@/lib/transparencyLog';

// PUBLIC: Merkle consistency proof between two signed tree heads. ?first=A&second=B (1 <= A <= B).
export async function GET(request: Request) {
  return runTlogRoute(request, 'consistency', async (db, url) => {
    const first = parseUintParam(url.searchParams.get('first'));
    const second = parseUintParam(url.searchParams.get('second'));
    if (first === null || second === null || first < 1 || first > second) {
      throw new TlogError('bad_request', 'first and second must be integers with 1 <= first <= second');
    }
    const body = await getConsistencyProof(db, first, second);
    return { body, cache: CACHE.immutable };
  });
}
