# Key rotation runbook

Use this procedure whenever the credential signing key (`VC_ISSUER_JWK`) or the Supabase
keys have to be replaced: scheduled rotation, a change of key type, or any time a key may have
been exposed. It takes about 30 minutes and has no downtime for verifiers.

The order matters. The old public key stays trusted only while stored credentials are being
re-signed, then it is removed.

```
new key  ->  re-sign stored credentials  ->  remove the old public key
```

Never paste a private key into chat, tickets, pull requests or logs. Keep it only in the
hosting provider's secret store.

## 0. Before you start

1. Note the current public key set: open `https://<your-domain>/.well-known/jwks.json` and save the
   `keys` entry you are replacing (public members only, it has no `d`). This is the "old public
   JWK" used in step 2.
2. Confirm you can sign in as a super admin (an approved `super_admin` role row).

## 1. Generate the new key (locally)

```bash
cd my-app
node scripts/generate-issuer-key.mjs
```

Stdout has two single-line JSON lines: `VC_ISSUER_JWK=<private jwk>` and the public JWK. Warnings go
to stderr. Nothing is written to disk. Run it on your own machine, not in a shared terminal or CI.
The key is Ed25519 (`alg: EdDSA`, `use: sig`) and its `kid` is the RFC 7638 thumbprint.

## 2. Configure the host (Vercel) and redeploy

In the project's environment variables (Production):

| Variable | Value |
| --- | --- |
| `VC_ISSUER_JWK` | the NEW private JWK (only the JSON after `VC_ISSUER_JWK=`) |
| `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` | `[<old PUBLIC jwk from step 0>]` |

`VC_ISSUER_PREVIOUS_PUBLIC_JWKS` keeps credentials signed with the old key verifying during the
transition. It must contain public members only; an entry with a private member is rejected.
Redeploy. Check `/.well-known/jwks.json`: the new key is listed first, the old one second.

## 3. Re-sign the stored credentials

As a super admin (browser session cookie, e.g. from the browser's developer tools console while
signed in), call the route. Start with a dry run:

```js
await fetch('/api/admin/vcs/resign', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ dryRun: true }),
}).then(r => r.json());
```

The response `data` has `scanned`, `resigned` (what would change in a dry run), `skipped`,
`failed` (`[{ id, reason }]`), `dryRun` and `limitReached`. Then run it for real with
`{ "dryRun": false }`. Each call handles at most `limit` credentials (default 200, maximum 2000);
repeat while `limitReached` is `true`. Rate limit: 5 calls per minute.

What it does:

- Only credentials with `status = 'active'` are touched. Revoked credentials stay revoked.
- The payload is rebuilt unchanged (same `id`, subject, issuance and expiration dates, status
  entry); only the proof is replaced, using the current key. `status`, `certificate_id` and
  `organization_id` are never changed.
- Credentials signed with the current key are skipped, so running it again is safe and a second
  run changes nothing. Expired credentials are skipped.
- One failing row never stops the rest. Look at `failed`; the reasons are stable codes
  (`malformed_proof`, `missing_proof`, `id_mismatch`, `signing_failed`, `write_failed`, ...).
- It answers 409 if `VC_ISSUER_JWK` is missing or unusable on the deployment (redo step 2).
- One audit row is written (`vc_resign`, target type `system`) with counts only.

Check the result:

- A final real run reports `resigned: 0` and `failed: []`.
- Spot-check a few credentials: `/api/vcs/verify?vcId=<id>` returns `valid: true`.
- Fetch a credential from the student's dashboard and confirm its token header `kid` equals the
  `kid` of the first key in the JWKS.

## 4. Remove the old public key

Set `VC_ISSUER_PREVIOUS_PUBLIC_JWKS` to `[]` and redeploy. From now on:

- credentials re-signed in step 3 verify with the new key;
- any copy still signed with the old key (an old download, PDF, QR code or wallet export) stops
  verifying, because that key is no longer trusted;
- `/.well-known/jwks.json` lists only the new key.

Check: `/api/vcs/verify?vcId=<id>` is still valid, and the JWKS has one key.

## 5. Supabase keys checklist

Do this when the project's anon or service-role key, or the JWT secret, must change.

1. Supabase dashboard, project settings, API keys (JWT keys): rotate the JWT secret / signing key
   if required. This invalidates existing sessions and issues new anon and service-role keys.
   Everyone has to sign in again.
2. Copy the new anon key and service-role key from the dashboard.
3. In the host's environment variables update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_JWT_SECRET` if the deployment sets it). The service-role
   key is server-side only and must never use a `NEXT_PUBLIC_` name.
4. Redeploy, then sign in and exercise: a login, a certificate upload, an approval and
   `/api/vcs/verify`.
5. If any other system holds the old keys (local `.env.local` files, CI secrets, scheduled jobs),
   update them too.
6. Dashboard, Authentication: review the user list and the audit log for anything unexpected
   around the time of the change.

## 6. A credential copy must keep working

If someone still needs a credential copy that was signed with the old key after step 4, it will
not verify. Re-issue it: the student opens their dashboard and downloads the credential again
(it is already re-signed and shows the new `kid`), or a reviewer re-issues it from the
certificate. If nobody can get a fresh copy yet, postpone step 4 and keep the old public key in
`VC_ISSUER_PREVIOUS_PUBLIC_JWKS` a little longer; the old key remains trusted for that time.

## Optional features

The revocation status list, SD-JWT selective disclosure and the transparency log are optional and
off in production by default (`VC_STATUS_LIST_ENABLED`, `SD_JWT_ENABLED`,
`TRANSPARENCY_LOG_ENABLED`). With them off there is no extra rotation work. If you have enabled any of them,
the re-sign route only covers the stored W3C credentials: previously issued SD-JWT credentials
and earlier signed tree heads are not re-signed, so re-issue SD-JWTs from the dashboard after the
rotation and tell verifiers of the log which key signs it from now on.
