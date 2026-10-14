'use client';

/**
 * Public transparency log page.
 *
 * Everything that matters is verified IN THE BROWSER by `@/lib/tlogVerify` and
 * `@/lib/merkle`: the server only supplies data (tree head, entry, audit path)
 * and the issuer public key set; a pass here does not depend on trusting the API.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  verifyConsistencyProofResponse,
  verifyInclusionProofResponse,
  verifyTreeHeadSignature,
  type CheckResult,
  type ConsistencyProofResponse,
  type InclusionProofResponse,
  type Jwks,
  type SignedTreeHead,
} from '@/lib/tlogVerify';

const ID_RE = /^[A-Za-z0-9:._-]{1,200}$/;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; head: SignedTreeHead; checks: CheckResult[] };

interface EventResult {
  index: number;
  entry: Record<string, unknown>;
  ok: boolean;
  checks: CheckResult[];
}

function lastSeenKey(logId: string) {
  return `tlog:last-head:${logId}`;
}

function readLastSeen(logId: string): SignedTreeHead | null {
  try {
    const raw = window.localStorage.getItem(lastSeenKey(logId));
    return raw ? (JSON.parse(raw) as SignedTreeHead) : null;
  } catch {
    return null;
  }
}

function writeLastSeen(head: SignedTreeHead) {
  try {
    window.localStorage.setItem(lastSeenKey(head.logId), JSON.stringify(head));
  } catch {
    // storage unavailable (private mode etc.): monitoring just won't persist
  }
}

async function getJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function loadJwks(): Promise<Jwks | null> {
  try {
    const { status, body } = await getJson<Jwks>('/.well-known/jwks.json');
    return status === 200 && body && Array.isArray(body.keys) ? body : null;
  } catch {
    return null;
  }
}

function StatusBadge({ status }: { status: CheckResult['status'] }) {
  const style =
    status === 'pass'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : status === 'fail'
        ? 'bg-red-100 text-red-800 border-red-300'
        : 'bg-gray-100 text-gray-700 border-gray-300';
  const label = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIPPED';
  return <span className={`inline-block w-20 rounded border px-2 py-0.5 text-center text-xs font-semibold ${style}`}>{label}</span>;
}

function CheckList({ checks }: { checks: CheckResult[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 text-sm">
          <StatusBadge status={c.status} />
          <span>
            <span className="font-medium text-gray-900">{c.label}.</span> <span className="text-gray-600">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function TransparencyPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [jwks, setJwks] = useState<Jwks | null>(null);
  const [credentialId, setCredentialId] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<EventResult[] | null>(null);
  const [append, setAppend] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [keys, sth] = await Promise.all([loadJwks(), getJson<SignedTreeHead>('/api/transparency/sth')]);
      setJwks(keys);
      if (sth.status === 404) {
        setState({ kind: 'unavailable', message: 'The transparency log is not enabled on this deployment, or has no entries yet.' });
        return;
      }
      if (sth.status !== 200 || !sth.body) {
        setState({ kind: 'unavailable', message: 'The transparency log is temporarily unavailable.' });
        return;
      }
      const head = sth.body;
      const checks: CheckResult[] = [];
      checks.push(
        keys
          ? await verifyTreeHeadSignature(head, keys)
          : { id: 'sth-signature', label: 'Tree head signature', status: 'skip', detail: 'Issuer key set could not be loaded.' }
      );

      // Append-only monitoring against the last head THIS browser saw.
      const prev = readLastSeen(head.logId);
      let appendResult: { ok: boolean; message: string } | null = null;
      if (prev && keys) {
        if (prev.treeSize === head.treeSize) {
          appendResult =
            prev.rootHash === head.rootHash
              ? { ok: true, message: `Same head as your last visit (${head.treeSize} entries).` }
              : { ok: false, message: 'The log shows a different root for the same size you saw before. History was changed or you were shown a different log.' };
        } else if (prev.treeSize < head.treeSize) {
          const q = `/api/transparency/proof/consistency?first=${prev.treeSize}&second=${head.treeSize}`;
          const cons = await getJson<ConsistencyProofResponse>(q);
          if (cons.status === 200 && cons.body) {
            const rep = await verifyConsistencyProofResponse(cons.body, { jwks: keys });
            // The server must not choose the "first" head: it has to be the one we stored.
            const pinned = cons.body.first.rootHash === prev.rootHash && cons.body.second.rootHash === head.rootHash;
            const ok = rep.ok && pinned;
            appendResult = {
              ok,
              message: ok
                ? `Verified: the log grew from ${prev.treeSize} to ${head.treeSize} entries and only appended (checked against the head you saw on ${new Date(prev.timestamp).toLocaleString()}).`
                : 'The log does not prove it is an append-only extension of the head you saw earlier.',
            };
          } else {
            appendResult = { ok: false, message: 'Could not fetch a consistency proof from the log.' };
          }
        } else {
          appendResult = { ok: false, message: 'The log is SMALLER than a head you saw earlier. Entries were removed or you were shown a different log.' };
        }
      }
      setAppend(appendResult);
      if (checks.every((c) => c.status === 'pass') && (appendResult === null || appendResult.ok)) writeLastSeen(head);
      setState({ kind: 'ready', head, checks });
    } catch {
      setState({ kind: 'unavailable', message: 'Could not reach the transparency log.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setResults(null);
    const id = credentialId.trim();
    if (!ID_RE.test(id)) {
      setLookupError('Enter a credential id (letters, digits, and : . _ - only, up to 200 characters).');
      return;
    }
    if (state.kind !== 'ready') return;
    setBusy(true);
    try {
      const list = await getJson<{ entries: Array<{ index: number }> }>(`/api/transparency/entries?credentialId=${encodeURIComponent(id)}`);
      if (list.status !== 200 || !list.body) {
        setLookupError('The log could not be queried right now.');
        return;
      }
      if (list.body.entries.length === 0) {
        setLookupError('No events for this credential are in the log. (The log only contains events recorded after it was enabled.)');
        return;
      }
      const out: EventResult[] = [];
      for (const item of list.body.entries) {
        const url = `/api/transparency/proof/inclusion?index=${item.index}&treeSize=${state.head.treeSize}`;
        const proof = await getJson<InclusionProofResponse>(url);
        if (proof.status !== 200 || !proof.body) {
          out.push({
            index: item.index,
            entry: {},
            ok: false,
            checks: [{ id: 'fetch', label: 'Fetch proof', status: 'fail', detail: 'The log did not return a proof for this entry.' }],
          });
          continue;
        }
        const report = await verifyInclusionProofResponse(proof.body, { jwks: jwks ?? undefined, expectedCredentialId: id });
        out.push({ index: item.index, entry: proof.body.entry, ok: report.ok, checks: report.checks });
      }
      setResults(out);
    } catch {
      setLookupError('The log could not be queried right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-gray-900">
      <h1 className="text-3xl font-bold">Credential transparency log</h1>
      <p className="mt-3 text-gray-700">
        Every time CampusSync issues or revokes a credential, a pseudonymous record is appended to a public, append-only log. The log is a Merkle
        tree whose head is signed with the issuer key, in the style of Certificate Transparency (RFC 6962 / RFC 9162). The checks below run in your
        browser, so you do not have to trust this server&apos;s word for them.
      </p>

      <section className="mt-8 rounded-lg border border-gray-200 p-5" aria-labelledby="head-title">
        <h2 id="head-title" className="text-xl font-semibold">
          Latest signed tree head
        </h2>
        {state.kind === 'loading' && <p className="mt-3 text-gray-600">Loading…</p>}
        {state.kind === 'unavailable' && <p className="mt-3 text-gray-700">{state.message}</p>}
        {state.kind === 'ready' && (
          <>
            <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
              <dt className="text-gray-500">Entries</dt>
              <dd className="font-mono">{state.head.treeSize}</dd>
              <dt className="text-gray-500">Root hash</dt>
              <dd className="break-all font-mono">{state.head.rootHash}</dd>
              <dt className="text-gray-500">Signed at</dt>
              <dd className="font-mono">{state.head.timestamp}</dd>
              <dt className="text-gray-500">Log id</dt>
              <dd className="break-all font-mono">{state.head.logId}</dd>
            </dl>
            <CheckList checks={state.checks} />
            {append && (
              <div className="mt-2 flex items-start gap-3 text-sm">
                <StatusBadge status={append.ok ? 'pass' : 'fail'} />
                <span>
                  <span className="font-medium">Append-only since your last visit.</span> <span className="text-gray-600">{append.message}</span>
                </span>
              </div>
            )}
            {!append && (
              <p className="mt-3 text-xs text-gray-500">
                This browser remembers the head it verified (local storage only). On your next visit it will ask the log to prove it only appended.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-gray-200 p-5" aria-labelledby="lookup-title">
        <h2 id="lookup-title" className="text-xl font-semibold">
          Verify a credential event
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Paste a credential id to fetch its logged events and check each Merkle inclusion proof and the tree head signature locally.
        </p>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="credential-id" className="sr-only">
            Credential id
          </label>
          <input
            id="credential-id"
            value={credentialId}
            onChange={(ev) => setCredentialId(ev.target.value)}
            placeholder="urn:uuid:…  or credential id"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <button
            type="submit"
            disabled={busy || state.kind !== 'ready'}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Fetch and verify'}
          </button>
        </form>
        {lookupError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {lookupError}
          </p>
        )}
        {results && (
          <ul className="mt-5 space-y-5">
            {results.map((r) => (
              <li key={r.index} className="rounded border border-gray-200 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={r.ok ? 'pass' : 'fail'} />
                  <span className="font-semibold">{String(r.entry.type ?? 'unknown event')}</span>
                  <span className="text-sm text-gray-600">
                    entry #{r.index} · {String(r.entry.at ?? '')}
                  </span>
                </div>
                <CheckList checks={r.checks} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 text-sm text-gray-700" aria-labelledby="meaning-title">
        <h2 id="meaning-title" className="text-xl font-semibold text-gray-900">
          What this proves, and what it does not
        </h2>
        <h3 className="mt-3 font-semibold text-gray-900">It proves</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>An event was recorded in the log at a specific position, and the record you see is the one the signed tree head commits to.</li>
          <li>
            Between two tree heads you have observed, the log only appended: nothing before the older head was changed, removed or reordered
            (consistency proof).
          </li>
          <li>The tree head was signed by the CampusSync issuer key published at /.well-known/jwks.json.</li>
        </ul>
        <h3 className="mt-3 font-semibold text-gray-900">It does not prove</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>That the event is true: the log records what CampusSync decided to log, not whether a degree or certificate is genuine.</li>
          <li>
            That the operator shows everybody the same log. Detecting a &quot;split view&quot; needs independent observers that compare tree heads
            (gossip) or monitor the log continuously. That is future work; this page only compares with the head your own browser saw before.
          </li>
          <li>That every event was logged: appends are best-effort, so a failure to log is possible and is not itself detectable from the log.</li>
        </ul>
        <p className="mt-3">
          Entries contain only identifiers and a keyed pseudonym of the student (never name, e-mail or the raw student id). Details are in
          docs/TRANSPARENCY-LOG.md.
        </p>
      </section>
    </main>
  );
}
