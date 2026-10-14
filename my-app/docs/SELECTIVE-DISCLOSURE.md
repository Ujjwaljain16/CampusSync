# Selective disclosure (SD-JWT) for shared credentials

Status: opt-in feature, off by default (`SD_JWT_ENABLED=true` to enable).

**Honest scope statement.** The mechanism in `src/lib/sdjwt.ts` is *modelled on* the IETF draft
"Selective Disclosure for JWTs (SD-JWT)" (`draft-ietf-oauth-selective-disclosure-jwt`) as understood by
the authors. It is tested for round trips and tamper cases in this repository. It is **not** a certified
implementation, has **not** been tested against other SD-JWT libraries or wallets, and supports only
top-level object-property disclosures (no nested or array-element disclosures). Do not claim
interoperability with third-party wallets or verifiers.

## Why

Before this feature, a recruiter could only learn about a student's credential by being handed raw
records. With selective disclosure the student holds a credential signed by the issuer and chooses, per
share, which claims a recipient can see. The recipient can verify the issuer signature on exactly the
revealed claims. The platform never has to give recruiters raw PII for this flow.

## Flow

```
 Student browser                CampusSync server                    Recruiter browser
 ---------------                -----------------                    -----------------
 /student/share
   pick certificate + claims
   (optional) make one-time
   holder key pair
        |  POST /api/credentials/sd/issue  {certificateId, holderPublicJwk?}
        |------------------------------>  withAuth: caller owns the certificate,
        |                                  it is verified, same org, and an ACTIVE
        |                                  row exists in verifiable_credentials
        |                                  -> sign SD-JWT with the issuer key
        |  <-- {sdJwt: jws~d1~d2~d3~d4~}   (disclosures are NOT stored server-side)
        v
   present(sdJwt, {reveal:[...],           <- runs in the browser, src/lib/sdjwt.ts
                   holderKey?, aud?, nonce?})
   -> jws~<chosen disclosures>~[kb-jwt]
   link = https://<site>/verify/sd#<presentation>      (URL FRAGMENT)
        |
        |  student sends the link out of band (message, email, ...)
        +---------------------------------------------------------->  opens the link
                                                                       the fragment is never sent
                                                                       to a server by the browser
                                         POST /api/credentials/sd/verify {presentation, audience?, nonce?}
                                   <---------------------------------------------------------|
                                   verifyPresentation(): issuer signature (alg allow-list,
                                   kid selection), exp/nbf, each disclosure's digest must be in
                                   `_sd`, no duplicates / reserved names / collisions,
                                   optional KB-JWT (sd_hash, aud, nonce, holder key from cnf)
                                   then: look up verifiable_credentials.status by `credential_ref`
                                   (fail closed on any lookup error)
                                   --------------------------------------------------------->
                                                                       sees: disclosed claims,
                                                                       names of withheld standard
                                                                       fields, validity, status
```

## Token layout

```
<issuer-signed JWT>~<disclosure>~<disclosure>~...~[<key-binding JWT>]
```

* Issuer JWT header: `typ: vc+sd-jwt`, `alg` (EdDSA / ES256 / RS256) and `kid` from the issuer key.
* Payload: `iss`, `sub` (opaque random `urn:uuid:...`, never the student id), `vct`, `iat`, `exp`, `jti`,
  `credential_ref` (non-selective), `_sd_alg: "sha-256"`, `_sd` (sorted SHA-256 digests incl. 2 decoys),
  and `cnf.jwk` when the student asked for a recipient label.
* Disclosure: `base64url(JSON [salt, name, value])`, 128-bit random salt. Digest =
  `base64url(SHA-256(disclosure string))`.
* KB-JWT (optional): header `typ: kb+jwt`; payload `{iat, aud, nonce, sd_hash}` where `sd_hash` is the
  base64url SHA-256 of everything before the KB-JWT (up to and including the last `~`).

## What is hidden and what is revealed

| Data | In the signed payload | In a presentation |
| --- | --- | --- |
| `title`, `institution`, `date_issued`, `certificate_id` | only as salted digest | only if the student ticked it |
| `degree_level`, `description` | only as salted digest, only if the certificate has them | only if revealed (not offered by the current UI) |
| student name, email, phone, student UUID | never included | never |
| `iss`, `sub` (opaque), `vct`, `iat`, `exp`, `jti` | clear | clear |
| `credential_ref` (the VC id) | clear | clear (needed for revocation, see limitations) |
| number of real claims | hidden by decoy digests (default 2) | n/a |
| names of withheld claims | not in the token | not in the token; the verify page lists the standard field names of this credential type as "not disclosed" |

Unrevealed values and their claim names do not appear anywhere in the presentation string, including
after base64 decoding (asserted in `tests/sdjwt/sdjwt.test.ts`).

## Revocation

`verifiable_credentials.status` is the source of truth. Issuing an SD-JWT requires an `active` credential
for the certificate, and every verification re-reads the status by `credential_ref`. A revoked,
suspended or expired credential, an unknown reference, or **any lookup error** yields `valid: false`
(fail closed). Revoking the credential therefore invalidates every link that was already shared.

## Threat model

Protected against:

* **Recipient learning withheld claims**: they are not in the presentation; digests are salted with 128
  random bits, so they cannot be brute-forced from guessable values such as dates.
* **Recipient or holder altering revealed claims**: a changed, renamed, swapped, duplicated or invented
  disclosure fails because its digest is not in the signed `_sd` list.
* **Forged tokens**: issuer signature is verified with an alg allow-list (`none` and HS256 are rejected;
  `oct` keys are never used as verification keys), `typ` allow-list, `kid` selection, `exp`/`nbf`.
* **Server logs and proxies seeing the presentation on page load**: it lives in the URL fragment.
  (The verify page POSTs it to the verification endpoint, which neither stores nor logs it.)
* **Enumeration/abuse**: both routes are rate limited (in-memory, per instance, best effort).
* **Issuance abuse**: only the certificate owner can mint an SD-JWT, only for a verified certificate in
  their organisation with an active credential.

Not protected against:

* **A link is a bearer token.** Whoever holds the link sees what it reveals until `exp` or revocation.
  The optional recipient label (KB-JWT) binds `aud`/`nonce` to the exact disclosures, but the one-time
  holder key is discarded after the link is made, so it does not stop forwarding. It is an integrity label,
  not an access control.
* **A malicious or compromised issuer/platform** can mint any claims. Selective disclosure protects
  holders from recipients, not from the issuer.
* **A recipient who collects several links** for the same credential can combine what they reveal.
* **Compromise of the browser** that creates the link (it briefly holds the full SD-JWT in memory).

## Limitations (read before relying on this)

* **`credential_ref` enables correlation.** To support revocation checks the VC id is a non-selective
  claim. Anyone who sees two presentations of the same credential can link them to each other. This is
  an explicit trade-off; true unlinkability would need a revocation scheme such as status lists with
  per-presentation randomisation, which is not implemented. `sub` and `jti` are random per issuance, but
  `credential_ref` is constant.
* **The issuer sees nothing about presentations** (no callback), but the *verification endpoint* sees each
  presentation POSTed to it, including the disclosed claims and the client IP (in transient rate-limit
  memory only). Run verification client-side or self-host if that matters; client-side verification is not
  implemented in this version.
* **No wallet app.** Presentations are links built in the student's browser. There is no OpenID4VCI /
  OpenID4VP exchange and no QR code (a QR encoder was deliberately not added; the link can be pasted
  into any QR generator the student trusts, but note that the link then passes through that tool).
* **Key binding is optional** and uses an ephemeral key (see above). Persistent holder keys / wallets are
  future work.
* **Decoys and the verify page**: the verify page lists the *standard* field names that were not disclosed;
  it cannot know whether optional fields (`degree_level`, `description`) exist.
* **Not a certified implementation** and not tested for interoperability with other SD-JWT software.
* Rate limits are per server instance and in memory only.
* Each "Create share link" action issues a fresh SD-JWT (new `jti` and salts). Disclosures are never
  stored, so the platform cannot re-derive an old token; accounting rows (`sd_issuances`) hold only
  `{credential_id, sd_jti, digest_list_hash, created_at}`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SD_JWT_ENABLED` | off | set to `true` to enable `/api/credentials/sd/*` (both routes return 404 otherwise) |
| `NEXT_PUBLIC_ISSUER_DID` | `did:web:example.org` | the `iss` of issued SD-JWTs; the verifier requires it to match |
| `VC_ISSUER_JWK` | required | existing issuer private key (EdDSA / ES256 / RS256); never leaves the server |

Optional DRAFT migration: `supabase/migrations/20261014_sd_issuances.sql` (accounting table; RLS on,
no policies, service role only). The code works without it.

## API

* `POST /api/credentials/sd/issue` (authenticated; rate limit 10/min/user): body
  `{certificateId, holderPublicJwk?, expiresInSeconds?}` (lifetime clamped to 1 hour .. 90 days, default
  30 days). Returns `{sdJwt, jti, credentialRef, disclosable, expiresAt}` with `Cache-Control: no-store`.
* `POST /api/credentials/sd/verify` (public; rate limit 30/min/IP): body
  `{presentation, audience?, nonce?}`. Returns `{valid, reason, claims, disclosed, notDisclosed, keyBound,
  keyBinding, issuer, expiresAt, credentialStatus}`; `claims` is empty when `valid` is false.
  Stable reason codes come from `verifyPresentation` plus `credential_ref_missing`, `credential_not_found`,
  `credential_revoked`, `credential_inactive`, `revocation_check_failed`, `verifier_not_configured`.
  If `audience` or `nonce` is supplied the presentation must carry a matching KB-JWT.

## Tests and benchmark

* `tests/sdjwt/sdjwt.test.ts`: round trips (0/1/all claims, decoys, EdDSA/ES256/RS256), tamper cases,
  algorithm confusion (`none`, HS256 with the public key as secret), expiry, key binding, plaintext
  absence checks.
* `tests/sdjwt/routes.test.ts`: route authorisation, revocation (fail closed), rate limiting, missing table.
* `tests/sdjwt/pages.test.tsx`: the verify page reads the fragment and renders disclosed/withheld claims.
* `node scripts/bench-sdjwt.mjs [N]` (Node >= 22.18): in-memory timings and presentation sizes. Results are
  machine-specific.
