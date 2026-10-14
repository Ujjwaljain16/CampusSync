# Credential Transparency Log

A tamper-evident, append-only log of credential events (`credential.issued`, `credential.revoked`),
modelled on Certificate Transparency (RFC 6962, with the proof algorithms of RFC 9162 section 2.1).
Anyone can check, without trusting the CampusSync server:

1. that an event **was logged** (Merkle inclusion proof),
2. that the log **only ever appended** between two tree heads they have seen (Merkle consistency proof), and
3. that the tree heads were **signed by the issuer key** published at `/.well-known/jwks.json`.

Status: **off by default** (`TRANSPARENCY_LOG_ENABLED`), database objects are a **DRAFT migration**.
"Modelled on RFC 6962/9162" means the hash tree and the proof generation/verification algorithms are
implemented and tested against a brute-force reference; it does **not** mean full compliance (no TLS wire
formats, no SCTs, no CT-style log list/policy). There is no blockchain involved.

## 1. Design

```
issue / revoke ──► appendEventSafely() ──► tlog_append(entry, leaf_hash)   (Postgres, advisory-locked)
                                                │
                                   tlog_entries (leaf_index, leaf_hash, entry)   append-only
                                                │
                    ensureTreeHead(): frontier(prev head) + new leaf hashes ──► root
                                                │  sign with issuer key (JWS, typ application/tlog-sth+json)
                                   tlog_tree_heads (tree_size, root_hash, signed_jws, frontier)   append-only

GET /api/transparency/sth                     latest signed tree head
GET /api/transparency/proof/inclusion         entry + audit path + signed head
GET /api/transparency/proof/consistency       consistency path + two signed heads
GET /api/transparency/entries                 paged entries, or events of one credential
/transparency                                 page that verifies all of the above in the browser
```

### Entry (leaf)

```json
{"at":"2026-10-14T12:00:00.000Z","certificateId":"…","credentialId":"…","organizationId":"…","studentHash":"<64 hex>","type":"credential.issued"}
```

* Canonical JSON: keys sorted, no whitespace (`canonicalJson` in `src/lib/tlogVerify.ts`). The leaf entry is
  its UTF-8 bytes.
* `studentHash = HMAC-SHA-256(TRANSPARENCY_LOG_SALT, studentId)`. The raw student id, name and e-mail are
  **never** stored; `validateEvent` also drops any unknown field, so extra data cannot ride along.
* Only `certificateId` and `organizationId` are optional.

### Hashing and trees (`src/lib/merkle.ts`)

* leaf hash `SHA-256(0x00 || entry)`, node hash `SHA-256(0x01 || left || right)`, empty tree `SHA-256("")`.
* Tree split: `k` = largest power of two strictly smaller than `n` (RFC 6962 section 2.1).
* Audit path (PATH) and consistency proof (PROOF/SUBPROOF) generation, and the iterative verifiers of
  RFC 9162 sections 2.1.3.2 / 2.1.4.2.
* SHA-256 is a small pure-JS implementation so that **the same code verifies in the browser**; it is tested
  against Node `crypto` for every input length 0-300 and 100 kB.
* Efficiency: `MerkleTree` stores the hash of every complete, aligned power-of-two subtree as it is
  completed and memoises ragged right-edge subtrees, so a proof for N = 100,000 leaves costs about 17 cache
  lookups instead of re-hashing N leaves (see the benchmark below). `CompactRange` (the "frontier", one hash
  per set bit of the size) lets the server extend a tree head in O(k + log N) hashes, reading only the k
  entries added since the previous head.

### Signed tree head

JWS (compact) over canonical JSON `{treeSize, rootHash, timestamp, logId}`, protected header
`{alg, kid, typ: "application/tlog-sth+json"}`, signed with the issuer key (`signPayload` in
`src/lib/signing.ts`, built on `getIssuerJwk` from `src/lib/vc.ts`). The `typ` keeps a tree-head signature
from being replayed as another kind of signed object. `logId` defaults to
`<NEXT_PUBLIC_ISSUER_DID>#transparency-log` (override with `TRANSPARENCY_LOG_ID`).

A head is produced right after each append (best effort) and, if entries exist beyond the newest head,
whenever the head or a proof is requested. There is at most one head per tree size. The head timestamp is
the signing time, not a freshness guarantee.

### Concurrency

`tlog_append` (SECURITY DEFINER, `search_path = public`, EXECUTE for `service_role` only) takes a
transaction-scoped advisory lock, computes `max(leaf_index)+1` and inserts. Because the lock is held to
commit, indexes are gap-free and become visible in order. Heads are keyed by tree size; two processes racing
to sign the same size both succeed (the loser re-reads the winner's head).

### Failure behaviour

* Flag off (default): every `/api/transparency/*` route answers 404, hooks do nothing, no DB access.
* Flag on but migration not applied (Postgres `42P01`/`42883`/`42703`, PostgREST `PGRST205`/`PGRST204`/`PGRST202`):
  treated as "feature unavailable": routes answer 503, appends log one warning. Issue/revoke are never affected.
* Appends are **best-effort**: `appendEventSafely` swallows and logs every error (timeout 8 s) and never
  throws into the issue/revoke path.
* On every proof the server cross-checks the stored entries against the signed head root and the entry
  against its leaf hash; a mismatch yields 503 and an error log (an inconsistency alarm for the operator).

## 2. What it proves, and what it does not

**Proves**

* An event with exactly this content sits at position *i* of a Merkle tree whose root is covered by a head
  signed by the issuer key (inclusion).
* Between two heads you have observed, nothing earlier was altered, removed or reordered (consistency): a
  rewrite of history cannot produce a valid consistency proof against the head you saved, short of a SHA-256
  collision.
* The operator cannot later deny having logged an event you hold a proof for.

**Does not prove**

* That the event is *true* (the log records what CampusSync decided to log; it says nothing about whether the
  underlying certificate is genuine).
* That the operator shows **everyone the same log** (split-view / equivocation). Detecting that needs
  independent observers that compare signed tree heads (gossip) and/or continuous monitors. That is future
  work. The browser page only compares with the head *that browser* saw before.
* **Completeness**: appends are best-effort, so an event can be missing, and a missing event is not detectable
  from the log alone. A reconciliation job (compare `verifiable_credentials` with the log) is future work.
* Anything about the issuer key being trustworthy: the heads are signed with the same issuer key as the
  credentials, so a stolen key can sign forged heads (but not a consistent history that extends heads others
  already hold).

## 3. Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| Operator edits/deletes an old entry | Merkle root changes; observers holding the old head fail the consistency check | Needs at least one observer with an old head |
| Operator hides a revocation | Not preventable by the log alone | Detectable only by reconciliation (future) |
| DB admin bypasses triggers | Triggers block UPDATE/DELETE/TRUNCATE for normal roles; signed heads + proofs expose rewrites | A superuser can disable triggers; only outside observers catch it |
| Server forges a proof | Client recomputes leaf hash, checks audit path and signature itself | None beyond SHA-256 and signature security |
| Replay of a tree-head signature as another object | `typ` header pinned in verifier | - |
| Student identification from the log | Keyed HMAC pseudonym, no names/e-mails; unknown fields dropped | Anyone holding the salt (operator) can link; ids of credentials/certificates/orgs are public |
| Right to erasure | Entries cannot be deleted by design; destroying/rotating the salt makes old pseudonyms unlinkable ("crypto-shredding") | Credential/certificate ids remain; take legal advice before enabling |
| Scraping / DoS of public API | `enforceRateLimit` (30 req/min/IP, in-memory per instance), strict numeric validation, CDN cache headers, limit <= 100 | In-memory limiter is per serverless instance |
| Key rotation | Verifier looks up `kid` in the JWKS | JWKS currently exposes only the current key; keep retired public keys published if you rotate |

## 4. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TRANSPARENCY_LOG_ENABLED` | unset (off) | `true` enables hooks, API and page content. Anything else = off |
| `TRANSPARENCY_LOG_SALT` | none | Server-only secret, at least 16 characters, used for the student pseudonym HMAC. Without it nothing is appended (an error is logged); never commit it. Changing it changes pseudonyms of new entries |
| `TRANSPARENCY_LOG_ID` | `<NEXT_PUBLIC_ISSUER_DID>#transparency-log` | Identifier embedded in signed heads |

Also required: a real `VC_ISSUER_JWK` (alg EdDSA/ES256/RS256, not the dev placeholder) and the service-role key.

## 5. Enabling it

1. Review and apply `supabase/migrations/20261014_tlog_transparency_log.sql` (DRAFT, idempotent). It creates
   `tlog_entries`, `tlog_tree_heads` (+ `frontier jsonb` column), the append-only triggers, RLS enabled with **no
   policies** (service role only), and `tlog_append(entry jsonb, leaf_hash text) returns bigint`.
   It has not been run against a live database by the author of this change: test it on a copy first.
2. Set `TRANSPARENCY_LOG_SALT` (long random) and optionally `TRANSPARENCY_LOG_ID`.
3. Set `TRANSPARENCY_LOG_ENABLED=true` and redeploy.
4. Issue or revoke a credential, then open `/transparency`.

Hooks live in `issueCredentialForCertificate` and `revokeAllCredentialsForCertificate`
(`src/lib/services/certificateService.ts`, covering both `/api/certificates/issue` and
`/api/certificates/approve`) and in `/api/vcs/revoke`. Credentials issued before enabling the log are not in it.

## 6. How a third party can monitor the log

Everything needed is public and read-only:

```bash
curl -s $BASE/api/transparency/sth                       # {logId, treeSize, rootHash, timestamp, jws}
curl -s $BASE/.well-known/jwks.json                      # issuer public keys
curl -s "$BASE/api/transparency/entries?from=0&limit=100"
curl -s "$BASE/api/transparency/proof/inclusion?index=7&treeSize=42"
curl -s "$BASE/api/transparency/proof/consistency?first=30&second=42"
```

A monitor should, periodically:

1. Fetch the head and verify its JWS against the JWKS (`typ` must be `application/tlog-sth+json`, payload must
   equal the displayed fields). `verifyTreeHeadSignature` in `src/lib/tlogVerify.ts` does exactly this and has
   no server dependencies.
2. **Persist every head it verifies.** Request a consistency proof from the newest saved head to the new head
   and verify it with `verifyConsistencyProofResponse`, additionally checking that `first` equals the head it
   stored (do not let the server choose it). Any failure, a smaller tree, or two different roots for one size
   are evidence of tampering or equivocation: keep both signed heads as proof.
3. Page through `/entries`, recompute each leaf hash, and rebuild the root locally (`MerkleTree` /
   `CompactRange` in `src/lib/merkle.ts`); compare with the signed root.
4. Optionally exchange saved heads with other monitors (gossip) to detect split views.

Auditing one credential: look up its events with `entries?credentialId=`, request inclusion proofs for the
latest `treeSize`, and run `verifyInclusionProofResponse`. The `/transparency` page does this in the browser.

## 7. Performance (measured, not promised)

`scripts/bench-merkle.mjs` benchmarks the real `src/lib/merkle.ts` with 100,000 synthetic leaves, in memory
(no DB, no network, no signing). Run `node scripts/bench-merkle.mjs`. Results are machine-specific; the
output of one run is recorded in the change report, not here, to avoid presenting a number out of context.

Known scaling limits of this implementation:

* Proof serving keeps a per-process in-memory tree built from `tlog_entries.leaf_hash` (about 2 x 32 bytes per
  leaf). A cold serverless instance has to read all leaf hashes once (1000 per request). Beyond a few hundred
  thousand entries, store interior nodes/tiles in the database instead.
* The first head after enabling the log reads all existing entries once; later heads read only new ones.
* The rate limiter is in-memory per instance.

## 8. Tests

`tests/transparency/` (run with `npx vitest --run tests/transparency`):

* `merkle.test.ts`: SHA-256 vs Node, CT reference roots for sizes 1-8, an independent brute-force RFC 6962
  reference compared for **all** tree sizes 1-64 with **all** indices (inclusion) and **all** (first, second)
  pairs (consistency), tamper tests (bit flips in proof/root/leaf, wrong index/size, truncated/extended
  proofs), empty tree, size 1, O(log N) provider-call counts at N = 100,000.
* `transparencyLog.test.ts`: append, concurrency, frontier-based incremental heads, signatures, end-to-end
  proofs, DB tamper detection, best-effort wrapper, error tolerance.
* `routes.test.ts`: flag, validation, status codes, caching headers, rate limiting.
* `hooks.test.ts`: issue/revoke hook behaviour.
* `page.test.tsx`: the page verifying proofs, failing on lies, and the append-only check.

The tests use an in-memory stand-in for Supabase; they do not exercise the SQL migration.
