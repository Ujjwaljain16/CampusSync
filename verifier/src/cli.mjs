/**
 * Command line front end for verifyCredentialOffline. Node only (reads files).
 * Kept separate from verify.mjs so that module stays browser-safe.
 */
import { verifyCredentialOffline, fetchTextLimited } from './verify.mjs';

export const USAGE = `Usage: campussync-verify <jws|file> [options]

  <jws|file>              a compact JWS, or a file containing a JWS or a credential JSON with proof.jws
  --jwks <file|url>       issuer public keys (JWKS). A https:// URL is fetched; otherwise a file is read.
                          Without --jwks/--did the keys are fetched from https://<host>/.well-known/jwks.json
                          derived from the UNVERIFIED "iss" claim (did:web:<host>); use --issuer to pin it.
  --did <file|url>        a did:web document instead of a JWKS
  --issuer <did>          require the signed issuer to equal this DID
  --no-status             do not check revocation (signature, expiry and issuer only)
  --max-status-age <sec>  reject status lists older than this
  --json                  print the full result as JSON
  -h, --help              show this help

Exit status: 0 valid, 1 invalid, 2 usage or input error.
`;

const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** @param {string[]} argv */
export function parseArgs(argv) {
	/** @type {{ json: boolean, noStatus: boolean, help: boolean, jwks?: string, did?: string, issuer?: string, maxStatusAge?: number }} */
	const opts = { json: false, noStatus: false, help: false };
	const rest = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const need = name => {
			const v = argv[++i];
			if (v === undefined) throw new Error(`${name} needs a value`);
			return v;
		};
		if (a === '--jwks') opts.jwks = need(a);
		else if (a === '--did') opts.did = need(a);
		else if (a === '--issuer') opts.issuer = need(a);
		else if (a === '--max-status-age') {
			const n = Number(need(a));
			if (!Number.isFinite(n) || n <= 0) throw new Error('--max-status-age must be a positive number of seconds');
			opts.maxStatusAge = n;
		} else if (a === '--no-status') opts.noStatus = true;
		else if (a === '--json') opts.json = true;
		else if (a === '-h' || a === '--help') opts.help = true;
		else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
		else rest.push(a);
	}
	if (rest.length > 1) throw new Error('Only one credential may be given');
	return { opts, input: rest[0] };
}

/**
 * @param {string[]} argv
 * @param {{ stdout?: (s: string) => void, stderr?: (s: string) => void, readFile?: (p: string) => Promise<string>, fetch?: typeof fetch, now?: Date | number }} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io = {}) {
	const out = io.stdout ?? (s => process.stdout.write(s));
	const err = io.stderr ?? (s => process.stderr.write(s));
	const readFile =
		io.readFile ??
		(async p => {
			const { readFile: rf } = await import('node:fs/promises');
			return rf(p, 'utf8');
		});

	let parsed;
	try {
		parsed = parseArgs(argv);
	} catch (e) {
		err(`${e.message}\n\n${USAGE}`);
		return 2;
	}
	const { opts, input } = parsed;
	if (opts.help) {
		out(USAGE);
		return 0;
	}
	if (!input) {
		err(USAGE);
		return 2;
	}

	let credential = input.trim();
	if (!JWS_RE.test(credential)) {
		try {
			credential = (await readFile(input)).trim();
		} catch {
			err(`Cannot read "${input}" and it is not a compact JWS.\n`);
			return 2;
		}
	}

	const vo = { fetch: io.fetch, now: io.now };
	if (opts.issuer) vo.expectedIssuer = opts.issuer;
	if (opts.noStatus) vo.checkStatus = false;
	if (opts.maxStatusAge) vo.maxStatusListAgeSec = opts.maxStatusAge;
	try {
		if (opts.jwks) {
			if (/^https?:\/\//i.test(opts.jwks)) vo.jwksUrl = opts.jwks;
			else vo.jwks = JSON.parse(await readFile(opts.jwks));
		}
		if (opts.did) {
			if (/^https?:\/\//i.test(opts.did)) {
				vo.didDocument = JSON.parse(await fetchTextLimited(opts.did, { fetch: io.fetch }));
			} else {
				vo.didDocument = JSON.parse(await readFile(opts.did));
			}
		}
	} catch (e) {
		err(`Could not load key material: ${e instanceof Error ? e.message : 'unknown error'}\n`);
		return 2;
	}

	const r = await verifyCredentialOffline(credential, vo);
	if (opts.json) {
		out(JSON.stringify(r, null, 2) + '\n');
		return r.valid ? 0 : 1;
	}

	const lines = [];
	lines.push(r.valid ? 'VALID' : `INVALID (${r.reason})`);
	if (r.signatureVerified) {
		lines.push(`  issuer:     ${r.issuer ?? '-'}`);
		lines.push(`  subject:    ${r.subject ?? '-'}`);
		lines.push(`  credential: ${r.credentialId ?? '-'}`);
		lines.push(`  issued:     ${r.issuedAt ?? '-'}`);
		lines.push(`  expires:    ${r.expiresAt ?? '-'}`);
		lines.push(`  key id:     ${r.keyId ?? '-'}`);
		lines.push(`  revoked:    ${r.revoked === null ? 'not checked' : r.revoked ? 'YES' : 'no'}`);
	}
	lines.push('  checks:');
	for (const c of r.checks) lines.push(`    [${c.ok ? 'ok' : 'FAIL'}] ${c.id}${c.detail ? `: ${c.detail}` : ''}`);
	if (r.valid && r.issuer && !opts.issuer) {
		lines.push(`  note: the issuer (${r.issuer}) was not pinned; a valid result only means this issuer's keys signed it.`);
	}
	out(lines.join('\n') + '\n');
	return r.valid ? 0 : 1;
}
