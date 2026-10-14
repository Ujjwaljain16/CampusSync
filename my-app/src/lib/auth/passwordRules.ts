/**
 * Rules for a NEW password (password reset). Shared by the reset page and the server route so both
 * enforce the same thing. Pure: safe to import from client and server code.
 *
 * Existing passwords are never checked against these (a user with an older, shorter password must
 * still be able to sign in).
 */

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt, which the auth provider uses, only looks at the first 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

/** Returns an error message for an unacceptable password, or null when it is fine. */
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes long`;
  }
  return null;
}
