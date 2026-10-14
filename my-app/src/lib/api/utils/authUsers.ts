/**
 * Auth user lookup helpers (service-role client only).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';

const PER_PAGE = 1000;
const MAX_PAGES = 20;

/**
 * Find an auth user by e-mail (case-insensitive).
 *
 * `auth.admin.listUsers()` is paginated; reading only the first page silently
 * misses users on larger projects. This walks pages until the user is found
 * or the list is exhausted, bounded to MAX_PAGES (20,000 users).
 *
 * @returns the user, or null when not found
 * @throws Error when the Auth admin API fails (callers map it to a generic 500)
 */
export async function findAuthUserByEmail(
  admin: Pick<SupabaseClient, 'auth'>,
  email: string
): Promise<User | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);

    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === needle);
    if (match) return match;
    if (users.length < PER_PAGE) return null; // last page
  }
  return null;
}
