// Generates a NEW Ed25519 issuer signing key for CampusSync credentials.
//
//   node scripts/generate-issuer-key.mjs
//
// Prints (1) a ready-to-paste `.env` line containing the PRIVATE key and (2) the matching PUBLIC key.
// Nothing is written to disk. The kid is the RFC 7638 JWK thumbprint of the public key.
//
// Rotation procedure: docs/KEY-ROTATION.md (new key -> re-sign stored credentials -> drop the old public key).
// Stdout is exactly two single-line JSON lines: `VC_ISSUER_JWK=<private jwk>` and the public jwk.
// Everything else goes to stderr. Run it locally only.
import { generateKeyPair, exportJWK, calculateJwkThumbprint } from 'jose';

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
const pub = await exportJWK(publicKey);
const priv = await exportJWK(privateKey);
const kid = await calculateJwkThumbprint(pub, 'sha256');

const publicJwk = { kty: pub.kty, crv: pub.crv, x: pub.x, kid, alg: 'EdDSA', use: 'sig' };
const privateJwk = { ...publicJwk, d: priv.d };

const bar = '='.repeat(72);
console.error(
  [
    bar,
    'WARNING: the next block contains a PRIVATE KEY.',
    '  - Do NOT commit it, paste it into tickets/chat, or put it in a NEXT_PUBLIC_ variable.',
    '  - Store it only in your hosting provider\'s server-side secret store / .env.local (git-ignored).',
    '  - Anyone holding it can issue credentials that verify as yours.',
    '  - Run this on your own machine, not in a shared terminal, CI log or screen recording.',
    bar,
  ].join('\n')
);

console.log(`VC_ISSUER_JWK=${JSON.stringify(privateJwk)}`);
console.log('');
console.error('Public key (safe to publish; this is what /.well-known/jwks.json will serve):');
console.log(JSON.stringify(publicJwk));
console.error('');
console.error(`kid: ${kid}`);
console.error('Hosting provider: paste only the JSON after "VC_ISSUER_JWK=" as the secret value (one line).');
console.error('When this key is later rotated out, add its PUBLIC jwk to VC_ISSUER_PREVIOUS_PUBLIC_JWKS.');
