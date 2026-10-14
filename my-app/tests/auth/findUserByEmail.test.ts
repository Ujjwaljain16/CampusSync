import { describe, it, expect, vi } from 'vitest';
import {
  findAuthUserByEmail,
  FIND_USER_PAGE_SIZE,
  FIND_USER_MAX_PAGES,
} from '@/lib/auth/findUserByEmail';

type U = { id: string; email?: string };

function makeClient(pages: U[][], opts: { errorOnPage?: number } = {}) {
  const listUsers = vi.fn(async ({ page }: { page: number; perPage: number }) => {
    if (opts.errorOnPage === page) return { data: { users: [] }, error: new Error('boom') };
    return { data: { users: pages[page - 1] ?? [] }, error: null };
  });
  return { client: { auth: { admin: { listUsers } } } as never, listUsers };
}

const fullPage = (prefix: string): U[] =>
  Array.from({ length: FIND_USER_PAGE_SIZE }, (_, i) => ({ id: `${prefix}${i}`, email: `${prefix}${i}@x.test` }));

describe('findAuthUserByEmail', () => {
  it('finds a user on page 3 (case-insensitive) by paginating', async () => {
    const { client, listUsers } = makeClient([
      fullPage('a'),
      fullPage('b'),
      [...fullPage('c').slice(0, 10), { id: 'target', email: 'Student@Campus.EDU' }],
    ]);

    const user = await findAuthUserByEmail(client, '  student@campus.edu ');

    expect(user?.id).toBe('target');
    expect(listUsers).toHaveBeenCalledTimes(3);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 3, perPage: FIND_USER_PAGE_SIZE });
  });

  it('returns null when the user does not exist and stops at the short page', async () => {
    const { client, listUsers } = makeClient([fullPage('a'), [{ id: '1', email: 'x@y.test' }]]);

    expect(await findAuthUserByEmail(client, 'nobody@y.test')).toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('is bounded: never requests more than the maximum number of pages', async () => {
    const endless = Array.from({ length: FIND_USER_MAX_PAGES + 5 }, (_, i) => fullPage(`p${i}-`));
    const { client, listUsers } = makeClient(endless);

    expect(await findAuthUserByEmail(client, 'nobody@y.test')).toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(FIND_USER_MAX_PAGES);
  });

  it('returns null for an empty email without calling the API', async () => {
    const { client, listUsers } = makeClient([]);
    expect(await findAuthUserByEmail(client, '   ')).toBeNull();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('propagates API errors so callers do not treat them as "not found"', async () => {
    const { client } = makeClient([fullPage('a')], { errorOnPage: 1 });
    await expect(findAuthUserByEmail(client, 'x@y.test')).rejects.toThrow('boom');
  });
});
