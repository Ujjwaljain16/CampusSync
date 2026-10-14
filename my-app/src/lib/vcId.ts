/**
 * Credential identifiers.
 *
 * Credentials are issued with `id = "urn:uuid:<uuid>"` and that exact string is what
 * `verifiable_credentials.id` stores. People (and older tooling) may also hand us the bare UUID,
 * so lookups accept both spellings and then use the id exactly as stored.
 */

const CREDENTIAL_ID_RE = /^(?:urn:uuid:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The spellings under which a credential id may be stored, most likely first. Empty when malformed. */
export function credentialIdCandidates(input: unknown): string[] {
  if (typeof input !== 'string') return [];
  const match = CREDENTIAL_ID_RE.exec(input.trim());
  if (!match) return [];
  const uuid = match[1].toLowerCase();
  return [`urn:uuid:${uuid}`, uuid];
}

/** Postgres "invalid input syntax" (e.g. a urn string against a uuid-typed column). */
export function isInvalidInputSyntax(error: { code?: string } | null | undefined): boolean {
  return error?.code === '22P02';
}
