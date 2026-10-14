# @campussync/verify

Verify a CampusSync student credential **without trusting CampusSync's database**.

The verifier needs only the credential (a compact JWS) and the issuer's *public* keys. It makes no call to any
CampusSync API other than downloading two public, issuer-signed documents when you let it: the key set (JWKS) and,
for revocation, the status list the credential points to. Both can also be supplied from local files.

## What it checks

| check | what it proves |
| --- | --- |
| `format`, `algorithm` | the input is a compact JWS and uses `EdDSA`, `ES256` or `RS256` (`none`, `HS*`, `PS*`, `ES512`... are refused) |
| `key_source`, `key` | the signing key was chosen **by the `kid` header** from the keys you supplied or fetched. `jwk` / `jku` / `x5u` headers inside the token are never used. A token with no `kid` is tried against each compatible key |
| `signature` | the issuer's key signed exactly these bytes |
| `validity` | `nbf` / `exp` against the clock (30 s tolerance, `now` can be injected) |
| `issuer` | the signed `iss` equals `--issuer` / `expectedIssuer` when you pin it, and matches the credential's own `issuer` |
| `payload` | the signed payload contains a credential with an `id` and a `credentialSubject`; `jti` equals that id |
| `status` | if the signed credential carries a `credentialStatus` entry: the issuer-signed status list is fetched, its signature is verified against the same issuer keys, it is matched to the entry (list URL, purpose, issuer) and the bit at `statusListIndex` must be `0` |

Every reported field (`issuer`, `subject`, `issuedAt`, ...) is taken from the **signed** payload, and only after
the signature verified.

## Command line

```sh
cd verifier && npm install        # installs jose
node bin/campussync-verify.mjs <jws | file> [--jwks <file|url>] [--did <file|url>] [--issuer <did>] [--no-status]
                                [--max-status-age <seconds>] [--json]
```

* `<file>` may contain a bare JWS or a credential JSON with `proof.jws` (also inside a `data` envelope).
* Without `--jwks`/`--did`, keys are fetched from `https://<host>/.well-known/jwks.json`, where `<host>` comes from
  the credential's `did:web:<host>` issuer. **That claim is unsigned until the signature has been checked**: whoever
  forges a credential can name their own host. Pass `--issuer did:web:<the university>` to pin who you expect.
* Exit status: `0` valid, `1` invalid, `2` usage / input error.

## Library

```js
import { verifyCredentialOffline } from '@campussync/verify';

const result = await verifyCredentialOffline(jwsOrCredentialJson, {
  jwks,                    // or didDocument, or jwksUrl
  expectedIssuer: 'did:web:university.example',
  // statusListFetch: async (url) => jwsOfTheList,   // supply the list yourself (fully offline)
  // maxStatusListAgeSec: 86400,                     // refuse stale lists
});
// { valid, reason, signatureVerified, issuer, subject, credentialId, issuedAt, expiresAt,
//   keyId, revoked: true|false|null, credential, statusList, checks: [{ id, ok, detail }] }
```

Stable `reason` codes: `ok`, `missing_input`, `malformed_token`, `alg_not_allowed`, `no_key_source`,
`key_fetch_failed`, `jwks_invalid`, `unknown_key`, `invalid_signature`, `expired`, `not_yet_valid`, `invalid_claims`,
`issuer_mismatch`, `invalid_payload`, `status_entry_invalid`, `status_list_unavailable`, `status_list_invalid`,
`status_list_signature_invalid`, `status_list_stale`, `status_index_out_of_range`, `revoked`.

`src/verify.mjs` only imports `jose` and uses web-standard APIs (`fetch`, `AbortController`, `DecompressionStream`,
`TextDecoder`), so the same file runs in Node >= 18 and in browsers. The CampusSync app's `/verify` page bundles a
byte-identical copy (`my-app/src/lib/offlineVerify/`, kept in sync by `my-app/scripts/sync-verifier.mjs` and a test).

## Network rules

When the verifier fetches the JWKS or a status list: `https://` only (no credentials in the URL), 5 second timeout,
1 MB response cap, at most 3 redirects, each of which must also be `https://`. Environments that hide redirect
targets (browsers return an "opaque redirect") are refused rather than followed blindly; use the final URL.
Decoded status lists are capped at 8 MiB so a malicious list cannot expand without bound.
`allowInsecureHttp: true` exists for local testing only.

## Honest scope

* **Valid means:** the issuer's key signed it, it is within its validity period, and (if it has a status entry)
  the issuer's own list says it is not revoked. It does **not** mean the issuer is trustworthy, that the holder
  is the student named in it (the credential is a bearer token; there is no holder binding), or that the
  keys you fetched are the real issuer's: that trust comes from DNS and TLS of the issuer's domain, or from
  how you obtained the JWKS file.
* **Revocation is only checkable offline for credentials issued with a `credentialStatus` entry.** Older
  credentials can only be checked against the issuer's server. A status list is a snapshot: the answer is as fresh
  as the list you hold (`maxStatusListAgeSec` lets you enforce a limit). The status list is an optional,
  off-by-default feature of the CampusSync server and is not enabled in the production deployment, so credentials
  issued there currently carry no status entry; the verifier then reports `revoked: null` and a `status` check noting
  that revocation cannot be checked offline. Check such credentials against the issuer's server
  (`GET /api/vcs/verify?vcId=<credential id>`).
* The status list format is *inspired by* the W3C Bitstring Status List draft (same entry fields, 131072-bit lists,
  most-significant-bit-first indexing, GZIP + multibase base64url); the credentials are JWS-encoded with the
  VC 1.1 context, not VC 2.0. This package is **not** certified against any W3C or IETF conformance suite and does
  not claim full compliance.
* No JSON-LD processing, no Data Integrity proofs, no `JsonWebSignature2020` detached-JWS verification:
  the `proof` object in a stored credential is informational; the verifier checks the JWS in `proof.jws` as a JWT.
