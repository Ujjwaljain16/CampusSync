'use client';

/**
 * Public credential verifier. Everything happens in this browser tab: the credential is
 * parsed and checked with `jose` (via the shared offline verifier module); the only network
 * requests are fetches of PUBLIC data (issuer keys, status list) from the issuer's own
 * well-known URLs. No CampusSync database or API route is called and the credential is
 * never uploaded anywhere.
 */
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { verifyCredentialOffline, type VerifyResult } from '@/lib/offlineVerify/verify.mjs';

const MAX_FILE_BYTES = 100_000;

const REASON_TEXT: Record<string, string> = {
	missing_input: 'Paste a credential or choose a file first.',
	malformed_token: 'This is not a valid compact JWS credential.',
	alg_not_allowed: 'The credential uses a signature algorithm this verifier does not accept.',
	no_key_source: 'No issuer keys were available. Enter the issuer keys URL or paste a JWKS.',
	key_fetch_failed: 'The issuer keys could not be fetched (https only, 5 s timeout, 1 MB limit). Browsers can only reach servers that allow it; you can paste the JWKS instead.',
	jwks_invalid: 'The issuer keys are not a valid JWKS.',
	unknown_key: 'None of the issuer keys matches the key id (kid) used to sign this credential.',
	invalid_signature: 'The signature does not match. The credential was altered or was not signed by these keys.',
	expired: 'The credential has expired.',
	not_yet_valid: 'The credential is not valid yet.',
	invalid_claims: 'The signed claims are malformed.',
	issuer_mismatch: 'The issuer does not match the expected issuer.',
	invalid_payload: 'The signed payload is not a credential this verifier understands.',
	status_entry_invalid: 'The credential has a malformed revocation status entry.',
	status_list_unavailable: 'The revocation status list could not be fetched, so revocation could not be checked.',
	status_list_invalid: 'The revocation status list is invalid.',
	status_list_signature_invalid: 'The revocation status list is not signed by the issuer keys.',
	status_list_stale: 'The revocation status list is too old.',
	status_index_out_of_range: 'The credential status index is outside its status list.',
	revoked: 'The issuer has revoked this credential.',
};

export default function VerifyPage() {
	const uid = useId();
	const [credential, setCredential] = useState('');
	const [keysUrl, setKeysUrl] = useState('');
	const [jwksText, setJwksText] = useState('');
	const [issuer, setIssuer] = useState('');
	const [busy, setBusy] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [result, setResult] = useState<VerifyResult | null>(null);

	async function onFile(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > MAX_FILE_BYTES) {
			setFormError('That file is too large for a credential (limit 100 KB).');
			return;
		}
		setFormError(null);
		setCredential(await file.text());
	}

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setFormError(null);
		setResult(null);

		let jwks: { keys: unknown[] } | undefined;
		if (jwksText.trim()) {
			try {
				jwks = JSON.parse(jwksText);
			} catch {
				setFormError('The pasted issuer keys are not valid JSON.');
				return;
			}
		}

		setBusy(true);
		try {
			setResult(
				await verifyCredentialOffline(credential, {
					jwks,
					jwksUrl: !jwks && keysUrl.trim() ? keysUrl.trim() : undefined,
					expectedIssuer: issuer.trim() || undefined,
				})
			);
		} finally {
			setBusy(false);
		}
	}

	const input = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
	const label = 'block text-sm font-medium text-gray-800';

	return (
		<main className="mx-auto min-h-screen max-w-3xl px-4 py-10 text-gray-900">
			<h1 className="text-2xl font-semibold">Verify a CampusSync credential</h1>
			<p className="mt-2 text-sm text-gray-700">
				The check runs entirely in your browser. Your credential is not sent to CampusSync; the page only downloads the
				issuer&apos;s public keys and revocation list. A valid result means the issuer&apos;s keys signed this credential
				and it has not expired or been revoked. It does not tell you whether you should trust that issuer.
			</p>

			<form onSubmit={onSubmit} className="mt-6 space-y-4" aria-describedby={formError ? `${uid}-error` : undefined}>
				<div>
					<label htmlFor={`${uid}-cred`} className={label}>
						Credential (compact JWS, or JSON containing proof.jws)
					</label>
					<textarea
						id={`${uid}-cred`}
						className={`${input} h-40 font-mono`}
						value={credential}
						onChange={e => setCredential(e.target.value)}
						spellCheck={false}
					/>
				</div>

				<div>
					<label htmlFor={`${uid}-file`} className={label}>
						Or choose a credential file
					</label>
					<input id={`${uid}-file`} type="file" accept=".json,.jws,.txt,application/json,text/plain" onChange={onFile} className="mt-1 block text-sm" />
				</div>

				<fieldset className="space-y-4 rounded-md border border-gray-200 p-4">
					<legend className="px-1 text-sm font-medium text-gray-800">Issuer keys (optional)</legend>
					<p className="text-xs text-gray-600">
						By default the keys are fetched from <code>https://&lt;host&gt;/.well-known/jwks.json</code>, where{' '}
						<code>&lt;host&gt;</code> comes from the credential&apos;s issuer (<code>did:web:&lt;host&gt;</code>). That claim is
						unsigned until the signature is checked, so pin the issuer below if you know who it should be.
					</p>
					<div>
						<label htmlFor={`${uid}-issuer`} className={label}>
							Expected issuer
						</label>
						<input id={`${uid}-issuer`} className={input} value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="did:web:university.example" autoComplete="off" />
					</div>
					<div>
						<label htmlFor={`${uid}-url`} className={label}>
							Issuer keys URL (https)
						</label>
						<input id={`${uid}-url`} className={input} value={keysUrl} onChange={e => setKeysUrl(e.target.value)} placeholder="https://university.example/.well-known/jwks.json" autoComplete="off" />
					</div>
					<div>
						<label htmlFor={`${uid}-jwks`} className={label}>
							Or paste a JWKS
						</label>
						<textarea id={`${uid}-jwks`} className={`${input} h-24 font-mono`} value={jwksText} onChange={e => setJwksText(e.target.value)} spellCheck={false} />
					</div>
				</fieldset>

				{formError && (
					<p id={`${uid}-error`} role="alert" className="text-sm text-red-700">
						{formError}
					</p>
				)}

				<button type="submit" disabled={busy} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60">
					{busy ? 'Verifying...' : 'Verify credential'}
				</button>
			</form>

			<section aria-live="polite" aria-label="Verification result" className="mt-8">
				{result && <Result r={result} />}
			</section>
		</main>
	);
}

function Result({ r }: { r: VerifyResult }) {
	const subject = r.credential?.credentialSubject as Record<string, unknown> | undefined;
	return (
		<div className="space-y-4">
			<div
				className={`rounded-md border p-4 ${r.valid ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'}`}
			>
				<h2 className="text-lg font-semibold">{r.valid ? 'Valid credential' : 'Not valid'}</h2>
				<p className="mt-1 text-sm">{r.valid ? 'The signature, validity period and revocation status all check out.' : REASON_TEXT[r.reason] ?? `Verification failed (${r.reason}).`}</p>
				<p className="mt-1 text-xs">
					Reason code: <code>{r.reason}</code>
				</p>
			</div>

			<div>
				<h3 className="text-sm font-semibold">Checks</h3>
				<ul className="mt-2 space-y-1 text-sm">
					{r.checks.map((c, i) => (
						<li key={`${c.id}-${i}`}>
							<span className={c.ok ? 'font-medium text-green-800' : 'font-medium text-red-800'}>{c.ok ? 'Passed' : 'Failed'}</span>{' '}
							<span className="font-medium">{c.id}</span>
							{c.detail ? <span className="text-gray-700">: {c.detail}</span> : null}
						</li>
					))}
				</ul>
			</div>

			{r.signatureVerified && (
				<div>
					<h3 className="text-sm font-semibold">Signed fields</h3>
					<dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
						<dt className="text-gray-600">Issuer</dt>
						<dd className="break-all">{r.issuer ?? '-'}</dd>
						<dt className="text-gray-600">Subject</dt>
						<dd className="break-all">{r.subject ?? '-'}</dd>
						<dt className="text-gray-600">Credential id</dt>
						<dd className="break-all">{r.credentialId ?? '-'}</dd>
						<dt className="text-gray-600">Issued</dt>
						<dd>{r.issuedAt ?? '-'}</dd>
						<dt className="text-gray-600">Expires</dt>
						<dd>{r.expiresAt ?? '-'}</dd>
						<dt className="text-gray-600">Signing key id</dt>
						<dd className="break-all">{r.keyId ?? '-'}</dd>
						<dt className="text-gray-600">Revoked</dt>
						<dd>{r.revoked === null ? 'Not checked (no status entry)' : r.revoked ? 'Yes' : 'No'}</dd>
					</dl>
					{subject && (
						<pre className="mt-3 overflow-x-auto rounded-md bg-gray-100 p-3 text-xs" aria-label="Credential subject">
							{JSON.stringify(subject, null, 2)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
