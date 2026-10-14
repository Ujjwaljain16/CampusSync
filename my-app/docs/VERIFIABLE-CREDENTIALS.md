# Verifiable credentials: keys, did:web, revocation, offline verification

Goal: **a student credential anyone can verify offline, without trusting CampusSync's database.**

A credential is a compact JWS (a JWT with a `vc` claim) signed by the issuer's key. A third party needs only the
credential and the issuer's *public* keys, plus, for revocation, the issuer-signed status list. This document
describes what exists, how to operate it, and where it falls short.

> **State of the production deployment.** Live: credentials signed with an RS256 key from `VC_ISSUER_JWK`, issuer
> `did:web:<host>`, `/.well-known/did.json`, `/.well-known/jwks.json`, public verification
> (`GET /api/vcs/verify?vcId=urn:uuid:...`) and key rotation through `VC_ISSUER_PREVIOUS_PUBLIC_JWKS`.
> Implemented and unit-tested but **off by default and not enabled in the production deployment**: the revocation
> status list (`VC_STATUS_LIST_ENABLED`; its tables have not been created there, so credentials issued there carry no
> `credentialStatus` entry). Revocation is checked against the server (`verifiable_credentials.status`). The sections
> below say what to run to enable the optional part.

> Wording: "inspired by" / "compatible with" below means *only* what the tests in `tests/vc` and `tests/verifier`
> exercise. Nothing here has been run against a W3C or IETF conformance suite. See [Limitations](#limitations).

## Contents

1. [Environment variables](#environment-variables)
2. [Credential format](#credential-format)
3. [Key rotation](#key-rotation) (and the step-by-step runbook)
4. [did:web](#didweb)
5. [Revocation status list](#revocation-status-list)
6. [Offline verification](#offline-verification) (CLI, library, `/verify` page)
7. [Benchmark](#benchmark)
8. [Limitations](#limitations)

## Environment variables

| variable | where | meaning |
| --- | --- | --- |
| `VC_ISSUER_JWK` | server, **secret** | The CURRENT private signing key as one-line JSON. `EdDSA` (Ed25519) is recommended; `ES256` and `RS256` also work. `kid` is optional: without it the RFC 7638 thumbprint of the public key is used everywhere (JWS header, JWKS, DID document). Generate with `node scripts/generate-issuer-key.mjs`. |
| `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` | server | JSON array of **public** JWKs of rotated-out keys, so old credentials keep verifying. An entry containing any private member (`d`, `p`, `q`, `dp`, `dq`, `qi`, `k`, `oth`) is rejected, not stripped: verification, `/.well-known/jwks.json` and `/.well-known/did.json` then fail with a clear error (signing is unaffected). `alg` may be omitted for Ed25519 / P-256 / RSA keys. Unset or `[]` means no previous keys. |
| `NEXT_PUBLIC_ISSUER_DID` | public | The issuer identifier, e.g. `did:web:university.example`. Written into every credential as `issuer`/`iss` and served as the DID document `id`. |
| `NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD` | public | **Legacy, no longer used for signing.** The proof's `verificationMethod` is now always `<NEXT_PUBLIC_ISSUER_DID>#<kid>` of the key that signed. |
| `VC_STATUS_LIST_ENABLED` | server | `true` turns on the revocation status list (default off; off in the production deployment). Needs the two optional migrations listed under "Storage" below. |
| `VC_VALIDITY_DAYS` | server | Days a new credential stays valid (`exp`), default `730`. |
| `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_SITE_URL` | public | Public origin used to build status list URLs (falls back to a host-only `did:web` origin). |

Use placeholders only in `.env.example`; real values belong in the hosting provider's secret store or an
untracked `.env.local`.

## Credential format

* Header: `{ alg, kid }`. `kid` is always present on newly signed credentials.
* Payload: `iss`, `sub` (the student id), `jti` (= `vc.id`, a `urn:uuid:`), `iat`, `nbf`, `exp`, and `vc` (a VC 1.1
  style object: `@context`, `type`, `issuer`, `issuanceDate`, `expirationDate`, `id`, `credentialSubject`, and
  `credentialStatus` when the status list is on).
* The stored credential additionally has a `proof` object whose `jws` is that compact JWS and whose
  `verificationMethod` is `<did>#<kid>`. Only the JWS is cryptographically meaningful; the surrounding `proof`
  fields are informational (see limitations).

Server-side verification (the public endpoints such as `/api/vcs/verify` and `/api/certificates/verify`) goes through
`src/lib/vcVerify.ts`: signature (key selected by `kid` from current + previous keys), expiry, then a **fail-closed**
lookup of `verifiable_credentials.status`. The database `status` column stays authoritative; the status list bit
can only turn a result into *revoked*.

## Key rotation

Rotation replaces the signing key **without invalidating credentials signed by the old key**.

How it works:

1. `VC_ISSUER_JWK` always holds the key used to sign **new** credentials.
2. The old key's *public* half moves into `VC_ISSUER_PREVIOUS_PUBLIC_JWKS`.
3. Verification picks the key by the JWS header `kid` from `[current, ...previous]`. A token whose `kid` is unknown
   fails with `unknown_key`; there is never a fallback to another key. Legacy tokens with **no** `kid` are tried against the
   current key first, then each previous key.
4. `/.well-known/jwks.json` publishes the current key first, then the previous keys; `/.well-known/did.json`
   lists the same keys as verification methods.

### Step-by-step

1. **Generate the new key** on a trusted machine: `node scripts/generate-issuer-key.mjs`. It prints a
   `VC_ISSUER_JWK=...` line (private, do not commit or paste into chat) and the public JWK, and writes nothing to disk.
2. **Capture the current public key.** `curl https://<your-host>/.well-known/jwks.json` and copy the first object of
   `keys` (it already contains its `kid`). If the current key has no explicit `kid`, this thumbprint kid is what old
   credentials carry. Do not edit the `kid`.
3. **Set the environment** in your hosting provider's secret store:
   * `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` = `[<old public jwk>]`, appending to any entries already there;
   * `VC_ISSUER_JWK` = the new private line from step 1.
4. **Deploy / restart.**
5. **Check:**
   * `GET /.well-known/jwks.json` returns two keys, the new one first, with no private members;
   * `GET /.well-known/did.json` has two verification methods;
   * verify an *old* credential (the `/verify` page or `node verifier/bin/campussync-verify.mjs <file> --issuer <did>`): still valid;
   * issue a new credential: its header `kid` is the new key's `kid`.
6. **Keep the old public key listed** at least until the last credential it signed has expired
   (issue date of the last old-key credential + `VC_VALIDITY_DAYS`), or for as long as you want those credentials to verify.
   Then remove it from `VC_ISSUER_PREVIOUS_PUBLIC_JWKS`.
7. **If the old key was compromised**, do the opposite of step 6: do **not** list it. Every credential it signed will fail with
   `unknown_key`, so re-issue the ones that must survive. Rotation cannot make a stolen key harmless while it stays listed.

### Re-signing stored credentials

Instead of waiting for old credentials to expire, a super admin can re-sign them with the current key and then remove the
previous public key: `POST /api/admin/vcs/resign` (body `{ "dryRun": true | false, "limit": n }`; implemented in
`src/lib/vcResign.ts`). It rebuilds each stored **active** credential unchanged (same id, subject and dates) and replaces
only the proof; revoked and expired credentials are skipped, a second run changes nothing, and one audit row with counts
is written. The full runbook (new key, previous key listed, dry run, real run, check, remove the previous key, plus the
Supabase keys checklist) is in [KEY-ROTATION.md](./KEY-ROTATION.md). It re-signs the stored W3C credentials only, not
SD-JWT credentials or earlier signed tree heads.

> **Status:** the tool is implemented, but the production issuer key has **not been rotated yet** (owner action
> pending; the Supabase API keys and the Gemini key were already replaced on 2026-10-15). Until it is, credentials in
> production are still signed with the original key, which appears in the early git history (see
> [SECURITY.md](../../SECURITY.md)).

## did:web

`GET /.well-known/did.json` serves a DID document for `NEXT_PUBLIC_ISSUER_DID` when it is a **host-only**
`did:web:<host>` (`%3A` for a port) and the request host matches. It contains:

* `@context`: `https://www.w3.org/ns/did/v1` and `https://w3id.org/security/suites/jws-2020/v1`
* `id`, `verificationMethod` (`{ id: <did>#<kid>, type: "JsonWebKey2020", controller, publicKeyJwk }` for the current and
  every previous key) and `assertionMethod` listing the same ids. Never any private member.
* `Cache-Control: public, max-age=300`, `Access-Control-Allow-Origin: *`.

Responses: `503` when the DID or key is missing/placeholder, `404` when the DID is not `did:web`, has path segments
(those resolve to `/<path>/did.json`, not `.well-known`), or the `Host`/`X-Forwarded-Host` header names another host.
If no host header is present the document is served anyway. The credential's `proof.verificationMethod`
(`<did>#<kid>`) resolves to a method in this document (tested).

Tested: the document's shape and that the issued credential's verification method resolves to a key that verifies it.
Not tested: resolution through an independent `did:web` resolver library.

## Revocation status list

Enabled by `VC_STATUS_LIST_ENABLED=true`. Off by default; when off, nothing changes for issuance or verification.
**Status: implemented and unit-tested, but not enabled in the production deployment** (`GET /api/status/revocation/...`
answers 404 there and the `vc_status_lists` table has not been created).

**To enable it:** apply `supabase/migrations/20261014_vc_status_lists.sql` and
`supabase/migrations/20261014_vc_status_list_columns.sql` (both idempotent) in the Supabase SQL editor, set
`VC_STATUS_LIST_ENABLED=true` in the host's environment (with `NEXT_PUBLIC_BASE_URL` or `NEXT_PUBLIC_SITE_URL` set to
the public origin, since it is written into every status entry), redeploy, then issue a
credential and check that its payload has a `credentialStatus` entry and that `/api/status/revocation/rev-1` returns a
JWS. Credentials issued before that carry no entry.

**Model** (`src/lib/statusList.ts`): a list is a fixed-size bitstring (131072 bits = 16 KiB). Each newly issued credential
is allocated one index; the bit is `1` when revoked. Index 0 is the most significant bit of byte 0. The public
representation is `encodedList = "u" + base64url(gzip(bytes))`.

**Issuance.** The credential payload (inside the signature) gets

```json
"credentialStatus": {
  "id": "<listUrl>#<index>",
  "type": "BitstringStatusListEntry",
  "statusPurpose": "revocation",
  "statusListIndex": "<index>",
  "statusListCredential": "<listUrl>"
}
```

`<listUrl>` is `<public origin>/api/status/revocation/rev-<n>`. If allocation fails (feature unavailable, database error)
the credential is issued **without** a status entry and the failure is logged; it is never reported as success and never
blocks issuance.

**Public list.** `GET /api/status/revocation/<listId>` (`Cache-Control: public, max-age=60`, CORS `*`, rate limited,
`404` when the flag is off) returns `{ jws, id, updatedAt }` where `jws` is a JWS (same issuer key and `kid` rules) over a credential of type
`["VerifiableCredential","BitstringStatusListCredential"]` whose subject is
`{ id: "<listUrl>#list", type: "BitstringStatusList", statusPurpose: "revocation", encodedList }`.

**Revocation.** `POST /api/vcs/revoke` and the certificate revert/reject path (`revokeAllCredentialsForCertificate`)
first update `verifiable_credentials.status` (authoritative), then set the bit best-effort. A failure to set the bit is
logged and never fails the revocation. The bit is set whenever the credential carries a `credentialStatus` entry,
even if the flag has since been switched off.

**Server verification** additionally reads the bit from the database copy: a set bit means `revoked`; a missing list or
lookup error fails closed (`revocation_check_failed`); storage that is not installed (migration not applied) is treated
as "bit not consulted" and the status column alone decides.

**Storage** (optional migrations, idempotent, not applied in production; the other migrations and their status are in
[DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md), section "Migration status"):

* `supabase/migrations/20261014_vc_status_lists.sql`: table `vc_status_lists` (RLS on, no policies, service role only) and
  SECURITY DEFINER functions `allocate_status_index(list_id)` (atomic `update ... where next_index < size returning`, creates
  the list on first use) and `set_status_bit(list_id, bit_index)` (atomic bit update), executable by `service_role` only.
* `supabase/migrations/20261014_vc_status_list_columns.sql`: informational `status_list_id`, `status_list_index` columns on
  `verifiable_credentials` (the application works without them).

The application treats Postgres `42P01`, `42703`, `42883` and PostgREST `PGRST202`, `PGRST204`, `PGRST205` as "feature unavailable".

The SQL has **not** been executed against a real PostgreSQL in this repository's tests (the status-list tests use an
in-memory fake that mirrors the documented semantics; the PostgreSQL model in `supabase/tests` covers the
`20261015_*` cleanup only). Run the verification queries at the bottom of the migration after applying it.

## Offline verification

### Command line

```sh
(cd verifier && npm install)                                                 # from the repository root
node verifier/bin/campussync-verify.mjs credential.json --issuer did:web:university.example
node verifier/bin/campussync-verify.mjs credential.json --jwks jwks.json     # fully offline key material
```

See `verifier/README.md` for options, reason codes and the network rules (https only, 5 s timeout, 1 MB cap).

### Library

`import { verifyCredentialOffline } from '@campussync/verify'`: returns `{ valid, reason, issuer, subject, issuedAt,
expiresAt, revoked, checks[] }`.

### Browser page

`/verify` (public, no login) verifies a pasted credential or uploaded file entirely in the browser with the same module and
`jose`. It makes no call to any CampusSync API; it downloads only the issuer's public keys / status list. Notes:

* The app's Content-Security-Policy `connect-src` currently allows `'self'` and Supabase only, so the page can fetch keys
  from **this** deployment's origin but not from other issuers; for those, paste the JWKS.
* Other origins can read the public endpoints (they send `Access-Control-Allow-Origin: *`).

## Benchmark

`node scripts/bench-verify.mjs [--n 1000]` signs N credentials in memory and measures `verifyCredentialOffline` latency
(p50/p95/p99, ops/sec) with and without a status-list check. It is single-threaded, warm, with keys and list already in
memory: a measurement of that machine only, not a service-level claim and not including network time.

## Limitations

What this is **not**, stated plainly:

* **Not standards-compliant end to end.** The credential is a JWT carrying a VC-1.1-shaped `vc` object, plus a separate
  `proof` wrapper typed `JsonWebSignature2020` whose `jws` is a normal (non-detached) JWT, so it is not a conformant
  JsonWebSignature2020 / Data Integrity proof. The VC 1.1 JWT encoding rule that removes duplicated claims from `vc` is not
  followed. No JSON-LD processing happens anywhere; the `@context` is not resolved or validated. No W3C or IETF conformance
  suite has been run.
* **Status list: inspired by, not compliant with, the W3C Bitstring Status List.** Same entry fields, minimum list size,
  bit order and compression/encoding, but: the list credential is JWS-enveloped with the VC 1.1 context (not VC 2.0 /
  `validFrom`), there is no `ttl`, only the `revocation` purpose exists (no `suspension`, `statusSize` or `statusMessage`),
  and indexes are allocated **sequentially**, which lets an observer infer issuance order of credentials. Random allocation
  is not implemented.
* **did:web:** only host-only DIDs are served; the document shape is tested but not against an independent resolver.
* **Trust root = the issuer's domain.** Keys are fetched over HTTPS from the issuer's host. Anyone who controls that DNS /
  TLS / server can publish different keys. A valid result says "these keys signed it", not "this is a legitimate
  university". Pin the expected issuer and obtain the JWKS out of band when it matters. When the verifier derives the key URL
  from the credential's own `iss`, that claim is unsigned until the signature checks out.
* **Revocation freshness.** A status list is a snapshot; a verifier holding an old copy sees the old answer. Verifiers can
  require a maximum age (`maxStatusListAgeSec`) but the issuer does not set an expiry on lists. The server caches a signed list
  for up to 60 s.
* **Credentials issued without a status entry** (before the flag was enabled, or when allocation failed) cannot have their
  revocation checked offline, only against the server (`/api/vcs/verify`). Until the status list is enabled in the
  production deployment, that is every credential it issues.
* **No holder binding / bearer credential.** Whoever holds the JWS can present it. It also exposes the student id,
  title, institution and dates to every verifier (this format has no selective disclosure; the optional SD-JWT feature,
  see [SELECTIVE-DISCLOSURE.md](./SELECTIVE-DISCLOSURE.md), is off by default and not enabled in production).
* **Key compromise.** Rotation preserves old credentials by design; if a key is compromised, keeping it in
  `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` keeps its forgeries valid. Removing it invalidates everything it signed.
* **Clocks.** Offline expiry checks use the verifier's clock (30 s tolerance).
* **Operational:** the in-memory rate limiter and the status-list signature cache are per server instance (the public
  verify endpoint additionally uses the Postgres-backed global limiter once its migration is applied, see
  [RATE-LIMITING.md](./RATE-LIMITING.md); it fails open to the in-memory one). The optional
  status-list SQL needs a test against a real database before it is enabled. The development placeholder key never
  produces verifiable credentials (and is refused in production).
* **Legacy field:** `NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD` is ignored for new credentials; credentials issued before this
  change keep whatever `verificationMethod` they were stored with (the JWS, not that field, is what gets verified).
