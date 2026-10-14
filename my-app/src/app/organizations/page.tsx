import { redirect } from 'next/navigation';

/**
 * The recruiter organization directory lives at /recruiter/organizations.
 * This legacy path used to call a super-admin-only endpoint and always failed
 * for recruiters, so it now just redirects.
 */
export default function OrganizationsPage() {
  redirect('/recruiter/organizations');
}
