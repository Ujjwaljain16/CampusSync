import { runTlogRoute, CACHE } from '../_shared';
import { TlogError, getLatestTreeHead } from '@/lib/transparencyLog';

// PUBLIC: latest signed tree head of the credential transparency log.
export async function GET(request: Request) {
  return runTlogRoute(request, 'sth', async (db) => {
    const head = await getLatestTreeHead(db);
    if (!head) throw new TlogError('not_found', 'The log is empty');
    return { body: head, cache: CACHE.head };
  });
}
