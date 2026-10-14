/**
 * Look up a Supabase auth user by email.
 *
 * `auth.admin.listUsers()` is paginated (50 users per page by default), so using
 * it without pagination as a "does this user exist" lookup silently breaks once
 * the user base grows. This helper walks the pages (bounded) until the email is
 * found. Prefer a direct lookup if/when Supabase exposes `getUserByEmail`.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

export const FIND_USER_PAGE_SIZE = 1000;
export const FIND_USER_MAX_PAGES = 20;

type AdminListClient = Pick<SupabaseClient, 'auth'>;

/**
 * @returns the matching user, or null when not found within the bounded scan.
 * @throws the Supabase error when a listUsers call fails (callers decide how to respond).
 */
export async function findAuthUserByEmail(
  adminClient: AdminListClient,
  email: string
): Promise<User | null> {
  const target = (email ?? '').trim().toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= FIND_USER_MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: FIND_USER_PAGE_SIZE,
    });

    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;

    // A short page means we reached the end of the user list.
    if (users.length < FIND_USER_PAGE_SIZE) return null;
  }

  return null;
}
