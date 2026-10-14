import { runTlogRoute, parseUintParam, CACHE } from '../_shared';
import { MAX_ENTRIES_PER_PAGE, TlogError, findEntriesByCredential, listEntries } from '@/lib/transparencyLog';

// PUBLIC: paged log entries (?from=&limit=, limit <= 100) or all events of one credential (?credentialId=).
// Entries contain only pseudonymous data (see docs/TRANSPARENCY-LOG.md); never raw student ids/names/e-mails.
export async function GET(request: Request) {
  return runTlogRoute(request, 'entries', async (db, url) => {
    const credentialId = url.searchParams.get('credentialId');
    if (credentialId !== null) {
      const body = await findEntriesByCredential(db, credentialId);
      return { body, cache: CACHE.listing };
    }
    const rawFrom = url.searchParams.get('from');
    const rawLimit = url.searchParams.get('limit');
    const from = rawFrom === null ? 0 : parseUintParam(rawFrom);
    const limit = rawLimit === null ? 50 : parseUintParam(rawLimit);
    if (from === null) throw new TlogError('bad_request', 'from must be a non-negative integer');
    if (limit === null || limit < 1 || limit > MAX_ENTRIES_PER_PAGE) {
      throw new TlogError('bad_request', `limit must be an integer between 1 and ${MAX_ENTRIES_PER_PAGE}`);
    }
    const body = await listEntries(db, from, limit);
    return { body, cache: CACHE.listing };
  });
}
