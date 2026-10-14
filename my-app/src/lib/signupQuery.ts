/**
 * Allow-listed parsing of the signup page query string (?role=&email=&oauth=).
 * Never trust the raw values: only known roles, a plausible email and the
 * literal `true` for oauth are accepted.
 */

export const SIGNUP_ROLES = ['student', 'faculty', 'recruiter'] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSignupRole(value: string | null | undefined): SignupRole | null {
  return (SIGNUP_ROLES as readonly string[]).includes(value ?? '') ? (value as SignupRole) : null;
}

export function parseSignupParams(search: string): {
  role: SignupRole | null;
  email: string | null;
  oauth: boolean;
} {
  const params = new URLSearchParams(search);
  const email = params.get('email');
  return {
    role: parseSignupRole(params.get('role')),
    email: email && email.length <= 254 && EMAIL_RE.test(email) ? email : null,
    oauth: params.get('oauth') === 'true',
  };
}
