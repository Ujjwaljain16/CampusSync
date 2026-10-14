/**
 * Transparency log: storage, append, signed tree heads and proof serving.
 * SERVER ONLY (uses the service-role client, Node crypto and the issuer key).
 *
 * Model (see docs/TRANSPARENCY-LOG.md): every credential event is canonicalised
 * to JSON, hashed as an RFC 6962-style leaf and appended to `tlog_entries`;
 * `tlog_tree_heads` stores Merkle roots signed with the issuer key. Modelled on
 * RFC 6962/9162; no claim of full compliance.
 *
 * Complexity (N = log size, k = entries added since the last stored head):
 *   appendEvent        1 RPC + head refresh: O(k + log N) hashes, reads k leaf hashes
 *                      (k is 1 in the normal one-append-one-head flow).
 *   ensureTreeHead     reads only leaf hashes in [lastHead.size, N): the previous
 *                      head's stored frontier (O(log N) hashes) replaces re-reading
 *                      the first lastHead.size leaves.
 *   proofs             served from a per-process MerkleTree (O(log N) per proof once
 *                      warm). Cold start reads all N leaf hashes once (paged). This is
 *                      the known scaling limit of this implementation.
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CompactRange, MerkleTree, fromHex, leafHash, toHex } from '@/lib/merkle';
import {
  TREE_HEAD_JWS_TYP,
  canonicalJson,
  decodeJwsPayload,
  entryLeafHashHex,
  type ConsistencyProofResponse,
  type InclusionProofResponse,
  type SignedTreeHead,
} from '@/lib/tlogVerify';
import { signPayload } from '@/lib/signing';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Configuration / errors
// ---------------------------------------------------------------------------

export const TLOG_EVENT_TYPES = ['credential.issued', 'credential.revoked'] as const;
export type TlogEventType = (typeof TLOG_EVENT_TYPES)[number];

export interface TlogEvent {
  type: TlogEventType;
  credentialId: string;
  certificateId?: string;
  organizationId?: string;
  /** HMAC-SHA-256(TRANSPARENCY_LOG_SALT, studentId) as hex. Never the raw id, name or e-mail. */
  studentHash: string;
  /** ISO-8601 UTC timestamp of the event. */
  at: string;
}

export function isTransparencyLogEnabled(): boolean {
  return process.env.TRANSPARENCY_LOG_ENABLED === 'true';
}

export type TlogErrorCode = 'disabled' | 'unavailable' | 'misconfigured' | 'bad_request' | 'not_found' | 'integrity' | 'db_error';

export class TlogError extends Error {
  constructor(
    public readonly code: TlogErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'TlogError';
  }
}

/** Postgres undefined_table / undefined_function / undefined_column and their PostgREST equivalents. */
const UNAVAILABLE_CODES = new Set(['42P01', '42883', '42703', 'PGRST205', 'PGRST204', 'PGRST202']);

export function isUndefinedTableError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && UNAVAILABLE_CODES.has(code);
}

/** Stable identifier of this log, embedded in every signed tree head. */
export function getLogId(): string {
  const explicit = process.env.TRANSPARENCY_LOG_ID?.trim();
  if (explicit) return explicit;
  const issuer = process.env.NEXT_PUBLIC_ISSUER_DID?.trim() || 'campussync';
  return `${issuer}#transparency-log`;
}

let warnedUnavailable = false;
function warnUnavailableOnce() {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn('[tlog] transparency log tables/functions not found; apply the tlog migration. Feature unavailable.');
}

function dbFail(err: unknown, what: string): never {
  if (isUndefinedTableError(err)) {
    warnUnavailableOnce();
    throw new TlogError('unavailable', 'Transparency log is not set up');
  }
  const code = (err as { code?: string } | null)?.code;
  logger.error(`[tlog] ${what} failed`, undefined, { code });
  throw new TlogError('db_error', `${what} failed`);
}

type Row = Record<string, unknown>;
type DbResult<T> = PromiseLike<{ data: T | null; error: unknown }>;

async function run<T>(p: DbResult<T>, what: string): Promise<T | null> {
  const { data, error } = await p;
  if (error) dbFail(error, what);
  return data;
}

function toSafeInt(v: unknown, what: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new TlogError('integrity', `Invalid ${what} returned by the database`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Student pseudonym
// ---------------------------------------------------------------------------

/**
 * Keyed hash of a student id. HMAC-SHA-256 under the deployment salt: without the
 * salt the pseudonym cannot be brute-forced from guessed ids and two deployments
 * cannot be linked. Throws `unavailable` when no usable salt is configured, so
 * the raw id can never end up in the log through a misconfiguration.
 */
export function hashStudentId(studentId: string, salt: string | undefined = process.env.TRANSPARENCY_LOG_SALT): string {
  if (!salt || salt.length < 16) throw new TlogError('misconfigured', 'TRANSPARENCY_LOG_SALT is not configured (min 16 chars)');
  if (typeof studentId !== 'string' || studentId.length === 0) throw new TlogError('bad_request', 'studentId is required');
  return createHmac('sha256', salt).update(studentId, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Event validation
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9:._-]{1,200}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function validateEvent(event: TlogEvent): TlogEvent {
  const fail = (m: string): never => {
    throw new TlogError('bad_request', m);
  };
  if (!event || typeof event !== 'object') fail('event required');
  if (!(TLOG_EVENT_TYPES as readonly string[]).includes(event.type)) fail('invalid event type');
  if (typeof event.credentialId !== 'string' || !ID_RE.test(event.credentialId)) fail('invalid credentialId');
  for (const k of ['certificateId', 'organizationId'] as const) {
    const v = event[k];
    if (v !== undefined && (typeof v !== 'string' || !ID_RE.test(v))) fail(`invalid ${k}`);
  }
  if (typeof event.studentHash !== 'string' || !HEX64.test(event.studentHash)) fail('studentHash must be 64 hex chars');
  if (typeof event.at !== 'string' || !ISO_RE.test(event.at) || Number.isNaN(Date.parse(event.at))) fail('invalid at');
  // Only the known fields are logged: nothing else can slip personal data into the log.
  const clean: TlogEvent = {
    type: event.type,
    credentialId: event.credentialId,
    studentHash: event.studentHash,
    at: event.at,
  };
  if (event.certificateId) clean.certificateId = event.certificateId;
  if (event.organizationId) clean.organizationId = event.organizationId;
  return clean;
}

// ---------------------------------------------------------------------------
// Tree heads
// ---------------------------------------------------------------------------

interface HeadRow {
  tree_size: number;
  root_hash: string;
  signed_jws: string;
  frontier: string[] | null;
}

function parseHeadRow(row: Row): HeadRow {
  const frontier = Array.isArray(row.frontier) && row.frontier.every((x) => typeof x === 'string') ? (row.frontier as string[]) : null;
  if (typeof row.root_hash !== 'string' || !HEX64.test(row.root_hash) || typeof row.signed_jws !== 'string') {
    throw new TlogError('integrity', 'Malformed tree head row');
  }
  return { tree_size: toSafeInt(row.tree_size, 'tree_size'), root_hash: row.root_hash, signed_jws: row.signed_jws, frontier };
}

/** Convert a stored row to the public DTO, checking the signed payload agrees with the columns. */
export function headRowToDto(row: HeadRow): SignedTreeHead {
  const payload = decodeJwsPayload(row.signed_jws);
  if (
    !payload ||
    payload.treeSize !== row.tree_size ||
    payload.rootHash !== row.root_hash ||
    typeof payload.timestamp !== 'string' ||
    typeof payload.logId !== 'string'
  ) {
    throw new TlogError('integrity', 'Stored tree head does not match its signed payload');
  }
  return { treeSize: row.tree_size, rootHash: row.root_hash, timestamp: payload.timestamp, logId: payload.logId, jws: row.signed_jws };
}

const HEAD_COLS = 'tree_size, root_hash, signed_jws, frontier';

async function fetchLatestHead(db: SupabaseClient): Promise<HeadRow | null> {
  const rows = await run<Row[]>(
    db.from('tlog_tree_heads').select(HEAD_COLS).order('tree_size', { ascending: false }).limit(1) as unknown as DbResult<Row[]>,
    'read latest tree head'
  );
  return rows && rows.length > 0 ? parseHeadRow(rows[0]) : null;
}

async function fetchHeadAt(db: SupabaseClient, treeSize: number): Promise<HeadRow | null> {
  const rows = await run<Row[]>(
    db.from('tlog_tree_heads').select(HEAD_COLS).eq('tree_size', treeSize).limit(1) as unknown as DbResult<Row[]>,
    'read tree head'
  );
  return rows && rows.length > 0 ? parseHeadRow(rows[0]) : null;
}

/** Number of entries currently in the log (max leaf_index + 1; indexes are gap-free). */
export async function getLogSize(db: SupabaseClient): Promise<number> {
  const rows = await run<Row[]>(
    db.from('tlog_entries').select('leaf_index').order('leaf_index', { ascending: false }).limit(1) as unknown as DbResult<Row[]>,
    'read log size'
  );
  return rows && rows.length > 0 ? toSafeInt(rows[0].leaf_index, 'leaf_index') + 1 : 0;
}

const PAGE = 1000; // PostgREST default max rows per request

async function forEachLeafHash(db: SupabaseClient, from: number, to: number, cb: (hash: Uint8Array) => void): Promise<void> {
  for (let start = from; start < to; start += PAGE) {
    const end = Math.min(to, start + PAGE);
    const rows = await run<Row[]>(
      db
        .from('tlog_entries')
        .select('leaf_index, leaf_hash')
        .gte('leaf_index', start)
        .lt('leaf_index', end)
        .order('leaf_index', { ascending: true }) as unknown as DbResult<Row[]>,
      'read leaf hashes'
    );
    if (!rows || rows.length !== end - start) throw new TlogError('integrity', 'Log entries are missing or not contiguous');
    rows.forEach((r, i) => {
      if (toSafeInt(r.leaf_index, 'leaf_index') !== start + i || typeof r.leaf_hash !== 'string' || !HEX64.test(r.leaf_hash)) {
        throw new TlogError('integrity', 'Log entries are missing or not contiguous');
      }
      cb(fromHex(r.leaf_hash));
    });
  }
}

/**
 * Make sure a signed tree head exists for the current log size and return it
 * (null for an empty log). Reads only entries newer than the latest stored head.
 * Safe to call concurrently: heads are keyed by tree size and a lost race just
 * returns the winner's head.
 */
export async function ensureTreeHead(db: SupabaseClient): Promise<SignedTreeHead | null> {
  // Order matters: read the head BEFORE the size. Heads only ever exist for sizes already
  // visible, so head.tree_size <= size holds even when another process publishes meanwhile.
  const latest = await fetchLatestHead(db);
  const size = await getLogSize(db);
  if (size === 0) return null;
  if (latest && latest.tree_size === size) return headRowToDto(latest);
  if (latest && latest.tree_size > size) throw new TlogError('integrity', 'Latest tree head is ahead of the stored entries');

  let range = new CompactRange();
  if (latest?.frontier) {
    range = CompactRange.fromHex(latest.tree_size, latest.frontier);
    if (toHex(range.root()) !== latest.root_hash) throw new TlogError('integrity', 'Stored frontier does not match the stored root');
  }
  await forEachLeafHash(db, range.size, size, (h) => range.append(h));
  const rootHash = toHex(range.root());

  const timestamp = new Date().toISOString();
  const logId = getLogId();
  let jws: string;
  try {
    jws = await signPayload({ treeSize: size, rootHash, timestamp, logId }, { typ: TREE_HEAD_JWS_TYP });
  } catch (e) {
    logger.error('[tlog] signing tree head failed', e instanceof Error ? { name: e.name, message: e.message } : undefined);
    throw new TlogError('unavailable', 'Tree head signing is unavailable');
  }

  const { error } = await db
    .from('tlog_tree_heads')
    .insert({ tree_size: size, root_hash: rootHash, signed_jws: jws, frontier: range.toHex() });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const winner = await fetchHeadAt(db, size);
      if (winner) return headRowToDto(winner);
    }
    dbFail(error, 'store tree head');
  }
  return { treeSize: size, rootHash, timestamp, logId, jws };
}

/** Latest signed tree head, creating one first when entries exist beyond the stored head. */
export async function getLatestTreeHead(db: SupabaseClient): Promise<SignedTreeHead | null> {
  return ensureTreeHead(db);
}

export async function getTreeHeadForSize(db: SupabaseClient, treeSize: number): Promise<SignedTreeHead | null> {
  const row = await fetchHeadAt(db, treeSize);
  return row ? headRowToDto(row) : null;
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

export interface AppendResult {
  index: number;
  leafHash: string;
  /** Tree head covering the new entry; null when head publication failed (the entry is still logged). */
  treeHead: SignedTreeHead | null;
}

/**
 * Append one event. The leaf index is assigned inside Postgres (`tlog_append`,
 * advisory-locked), so concurrent appends never share or skip an index. The
 * signed tree head is refreshed afterwards; its failure does not undo the append.
 */
export async function appendEvent(
  db: SupabaseClient,
  event: TlogEvent,
  opts: { publishHead?: boolean } = {}
): Promise<AppendResult> {
  const clean = validateEvent(event);
  const canonical = canonicalJson(clean);
  const leaf = toHex(leafHash(canonical));

  const { data, error } = await db.rpc('tlog_append', { entry: clean, leaf_hash: leaf });
  if (error) dbFail(error, 'append entry');
  const index = toSafeInt(data, 'leaf index');

  let treeHead: SignedTreeHead | null = null;
  if (opts.publishHead !== false) {
    try {
      treeHead = await ensureTreeHead(db);
    } catch (e) {
      if (!(e instanceof TlogError && e.code === 'unavailable')) {
        logger.error('[tlog] tree head refresh after append failed', e instanceof Error ? { name: e.name, message: e.message } : undefined);
      }
    }
  }
  return { index, leafHash: leaf, treeHead };
}

export interface SafeAppendInput {
  type: TlogEventType;
  credentialId: string;
  certificateId?: string | null;
  organizationId?: string | null;
  /** Raw student id; hashed here and never stored. Looked up from the credential when omitted. */
  studentId?: string | null;
  at?: string;
}

const APPEND_TIMEOUT_MS = 8000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('transparency log append timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fill in student/certificate/organization for events whose caller did not have them. */
async function enrich(db: SupabaseClient, input: SafeAppendInput): Promise<SafeAppendInput> {
  let { studentId, certificateId, organizationId } = input;
  if (!studentId || !certificateId) {
    const { data } = await db
      .from('verifiable_credentials')
      .select('student_id, credential')
      .eq('id', input.credentialId)
      .maybeSingle();
    if (data) {
      studentId = studentId || ((data as Row).student_id as string | undefined);
      const subject = ((data as Row).credential as { credentialSubject?: { certificateId?: unknown } } | null)?.credentialSubject;
      if (!certificateId && typeof subject?.certificateId === 'string') certificateId = subject.certificateId;
    }
  }
  if (!organizationId && certificateId) {
    const { data } = await db.from('certificates').select('organization_id').eq('id', certificateId).maybeSingle();
    const org = (data as Row | null)?.organization_id;
    if (typeof org === 'string') organizationId = org;
  }
  return { ...input, studentId, certificateId, organizationId };
}

async function adminDb(): Promise<SupabaseClient> {
  const { createSupabaseAdminClient } = await import('@/lib/supabaseServer');
  return (await createSupabaseAdminClient()) as unknown as SupabaseClient;
}

/**
 * Best-effort wrapper for the issue/revoke hooks: does nothing unless
 * TRANSPARENCY_LOG_ENABLED=true, never throws, never blocks longer than a few
 * seconds, and treats a missing table/function as "feature unavailable".
 * Pass `db` only in tests; production callers rely on the service-role client.
 */
export async function appendEventSafely(input: SafeAppendInput, db?: SupabaseClient): Promise<void> {
  await appendEventsSafely([input], db);
}

export async function appendEventsSafely(inputs: SafeAppendInput[], db?: SupabaseClient): Promise<void> {
  if (!isTransparencyLogEnabled() || inputs.length === 0) return;
  try {
    await withTimeout(
      (async () => {
        const client = db ?? (await adminDb());
        for (let i = 0; i < inputs.length; i++) {
          const filled = await enrich(client, inputs[i]);
          if (!filled.studentId) throw new TlogError('bad_request', 'student could not be determined for the event');
          await appendEvent(
            client,
            {
              type: filled.type,
              credentialId: filled.credentialId,
              certificateId: filled.certificateId ?? undefined,
              organizationId: filled.organizationId ?? undefined,
              studentHash: hashStudentId(filled.studentId),
              at: filled.at ?? new Date().toISOString(),
            },
            { publishHead: i === inputs.length - 1 }
          );
        }
      })(),
      APPEND_TIMEOUT_MS * Math.max(1, Math.min(inputs.length, 5))
    );
  } catch (e) {
    if (e instanceof TlogError && e.code === 'unavailable') {
      warnUnavailableOnce();
      return;
    }
    // Message only: never log the event, the salt or the key.
    logger.error('[tlog] best-effort append failed', e instanceof Error ? { name: e.name, message: e.message } : undefined);
  }
}

// ---------------------------------------------------------------------------
// Proofs (served from a per-process cached tree)
// ---------------------------------------------------------------------------

let cachedTree: MerkleTree | null = null;
let treeLock: Promise<unknown> = Promise.resolve();

/** Test helper. */
export function __resetTlogCaches(): void {
  cachedTree = null;
  treeLock = Promise.resolve();
  warnedUnavailable = false;
}

function withTree<T>(db: SupabaseClient, upTo: number, fn: (tree: MerkleTree) => T): Promise<T> {
  const task = async () => {
    if (!cachedTree) cachedTree = new MerkleTree();
    const tree = cachedTree;
    if (tree.size < upTo) await forEachLeafHash(db, tree.size, upTo, (h) => tree.append(h));
    return fn(tree);
  };
  const result = treeLock.then(task, task);
  treeLock = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** Cross-check the in-memory tree against the signed head; a mismatch means the DB no longer matches signed history. */
function assertMatchesHead(tree: MerkleTree, head: SignedTreeHead): void {
  if (toHex(tree.root(head.treeSize)) !== head.rootHash) {
    cachedTree = null;
    logger.error('[tlog] INTEGRITY: stored entries do not reproduce a signed tree head root', undefined, { treeSize: head.treeSize });
    throw new TlogError('integrity', 'Stored entries do not match the signed tree head');
  }
}

export async function getInclusionProof(
  db: SupabaseClient,
  index: number,
  treeSize?: number
): Promise<InclusionProofResponse> {
  let head: SignedTreeHead | null;
  if (treeSize === undefined) {
    head = await ensureTreeHead(db);
    if (!head) throw new TlogError('not_found', 'The log is empty');
  } else {
    head = await getTreeHeadForSize(db, treeSize);
    if (!head) throw new TlogError('not_found', 'No signed tree head exists for that tree size');
  }
  if (!Number.isSafeInteger(index) || index < 0 || index >= head.treeSize) {
    throw new TlogError('bad_request', 'index must be smaller than the tree size');
  }

  const rows = await run<Row[]>(
    db.from('tlog_entries').select('leaf_index, leaf_hash, entry').eq('leaf_index', index).limit(1) as unknown as DbResult<Row[]>,
    'read entry'
  );
  if (!rows || rows.length === 0) throw new TlogError('not_found', 'Entry not found');
  const row = rows[0];
  const entry = row.entry as Record<string, unknown>;
  const storedLeaf = String(row.leaf_hash);
  if (entryLeafHashHex(entry) !== storedLeaf) {
    logger.error('[tlog] INTEGRITY: entry does not hash to its stored leaf hash', undefined, { index });
    throw new TlogError('integrity', 'Stored entry does not match its leaf hash');
  }

  const proof = await withTree(db, head.treeSize, (tree) => {
    assertMatchesHead(tree, head as SignedTreeHead);
    if (toHex(tree.leafHashAt(index)) !== storedLeaf) throw new TlogError('integrity', 'Leaf hash mismatch');
    return tree.inclusionProof(index, (head as SignedTreeHead).treeSize).map(toHex);
  });

  return { logId: head.logId, index, treeSize: head.treeSize, entry, leafHash: storedLeaf, proof, sth: head };
}

export async function getConsistencyProof(db: SupabaseClient, first: number, second: number): Promise<ConsistencyProofResponse> {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 1 || first > second) {
    throw new TlogError('bad_request', 'first and second must satisfy 1 <= first <= second');
  }
  const [a, b] = await Promise.all([getTreeHeadForSize(db, first), getTreeHeadForSize(db, second)]);
  if (!a || !b) throw new TlogError('not_found', 'No signed tree head exists for one of the requested sizes');
  const proof = await withTree(db, second, (tree) => {
    assertMatchesHead(tree, b);
    assertMatchesHead(tree, a);
    return tree.consistencyProof(first, second).map(toHex);
  });
  return { logId: b.logId, first: a, second: b, proof };
}

// ---------------------------------------------------------------------------
// Entry listing
// ---------------------------------------------------------------------------

export interface EntryListing {
  logId: string;
  treeSize: number;
  from: number;
  nextFrom: number | null;
  entries: Array<{ index: number; leafHash: string; entry: Record<string, unknown> }>;
}

export const MAX_ENTRIES_PER_PAGE = 100;

/** Entries [from, from+limit) restricted to those covered by the latest signed head. */
export async function listEntries(db: SupabaseClient, from: number, limit: number): Promise<EntryListing> {
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ENTRIES_PER_PAGE) {
    throw new TlogError('bad_request', `from must be >= 0 and limit between 1 and ${MAX_ENTRIES_PER_PAGE}`);
  }
  const head = await ensureTreeHead(db);
  if (!head) throw new TlogError('not_found', 'The log is empty');
  const end = Math.min(head.treeSize, from + limit);
  let entries: EntryListing['entries'] = [];
  if (from < end) {
    const rows = await run<Row[]>(
      db
        .from('tlog_entries')
        .select('leaf_index, leaf_hash, entry')
        .gte('leaf_index', from)
        .lt('leaf_index', end)
        .order('leaf_index', { ascending: true }) as unknown as DbResult<Row[]>,
      'list entries'
    );
    entries = (rows ?? []).map((r) => ({
      index: toSafeInt(r.leaf_index, 'leaf_index'),
      leafHash: String(r.leaf_hash),
      entry: r.entry as Record<string, unknown>,
    }));
  }
  return { logId: head.logId, treeSize: head.treeSize, from, nextFrom: end < head.treeSize ? end : null, entries };
}

/** All logged events of one credential (issue, revoke, ...), restricted to the latest signed head. */
export async function findEntriesByCredential(
  db: SupabaseClient,
  credentialId: string
): Promise<Pick<EntryListing, 'logId' | 'treeSize' | 'entries'>> {
  if (typeof credentialId !== 'string' || !ID_RE.test(credentialId)) throw new TlogError('bad_request', 'invalid credentialId');
  const head = await ensureTreeHead(db);
  if (!head) throw new TlogError('not_found', 'The log is empty');
  const rows = await run<Row[]>(
    db
      .from('tlog_entries')
      .select('leaf_index, leaf_hash, entry')
      .eq('entry->>credentialId', credentialId)
      .lt('leaf_index', head.treeSize)
      .order('leaf_index', { ascending: true })
      .limit(MAX_ENTRIES_PER_PAGE) as unknown as DbResult<Row[]>,
    'find entries'
  );
  return {
    logId: head.logId,
    treeSize: head.treeSize,
    entries: (rows ?? []).map((r) => ({
      index: toSafeInt(r.leaf_index, 'leaf_index'),
      leafHash: String(r.leaf_hash),
      entry: r.entry as Record<string, unknown>,
    })),
  };
}
