/**
 * Minimal in-memory fake of the parts of the Supabase client used by the
 * certificate routes/services. It evaluates eq / in / contains / neq filters,
 * supports select / insert / update / delete (+ `.select()` after a mutation),
 * order / limit / single / maybeSingle, auth.getUser and storage.remove, and can
 * simulate RLS (zero-row writes) and injected errors.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Row = Record<string, any>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Ordered log of operations, e.g. 'update:certificates', 'delete:certificates', 'storage.remove'. */
  log: string[];
  /** Inserted rows per table (in order). */
  inserts: Record<string, Row[]>;
  /** `${op}:${table}` -> error (message, or {message, code}) to return instead of performing the operation. */
  errors: Record<string, string | { message: string; code?: string }>;
  /** Every write (insert / update / delete) with the client that issued it ('user' or 'admin'). */
  writes: Array<{ client: string; op: 'insert' | 'update' | 'delete'; table: string; values?: Row }>;
  /**
   * Model of the one-active-credential-per-certificate partial unique index: inserting a second
   * ACTIVE verifiable_credentials row for the same certificate_id fails with 23505.
   */
  uniqueActiveCredential: boolean;
  /** `${op}:${table}` -> perform no change and return zero rows (simulated RLS). */
  rlsBlocked: Set<string>;
  storageRemoved: string[];
  user: { id: string } | null;
  /** The signed-in user's client (subject to RLS in production). */
  client: any;
  /** The service-role client over the same data. */
  adminClient: any;
}

function jsonContains(haystack: any, needle: any): boolean {
  if (needle !== null && typeof needle === 'object' && !Array.isArray(needle)) {
    if (haystack === null || typeof haystack !== 'object') return false;
    return Object.entries(needle).every(([k, v]) => jsonContains(haystack[k], v));
  }
  return haystack === needle;
}

export function createFakeDb(initial: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables: Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.map(r => ({ ...r }))])),
    log: [],
    inserts: {},
    errors: {},
    writes: [],
    uniqueActiveCredential: false,
    rlsBlocked: new Set(),
    storageRemoved: [],
    user: null,
    client: null,
    adminClient: null,
  };

  class Query implements PromiseLike<any> {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private values: any;
    private filters: Array<(r: Row) => boolean> = [];
    private returning = false;
    private orderBy: { col: string; asc: boolean } | null = null;
    private limitN: number | null = null;
    private mode: 'many' | 'single' | 'maybe' = 'many';

    constructor(private table: string, private label: string) {}

    select() {
      if (this.op !== 'select') this.returning = true;
      return this;
    }
    insert(values: any) { this.op = 'insert'; this.values = values; return this; }
    update(values: any) { this.op = 'update'; this.values = values; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this; }
    neq(col: string, val: any) { this.filters.push(r => r[col] !== val); return this; }
    in(col: string, vals: any[]) { this.filters.push(r => vals.includes(r[col])); return this; }
    contains(col: string, val: any) { this.filters.push(r => jsonContains(r[col], val)); return this; }
    order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
    limit(n: number) { this.limitN = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }

    then<T1 = any, T2 = never>(
      onfulfilled?: ((value: any) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private shape(rows: Row[]) {
      if (this.mode === 'many') return { data: rows, error: null };
      if (rows.length > 1) return { data: null, error: { message: 'multiple rows returned' } };
      if (rows.length === 0) {
        return this.mode === 'single'
          ? { data: null, error: { message: 'no rows returned' } }
          : { data: null, error: null };
      }
      return { data: rows[0], error: null };
    }

    private execute() {
      const key = `${this.op}:${this.table}`;
      db.log.push(key);
      if (this.op !== 'select') {
        db.writes.push({ client: this.label, op: this.op, table: this.table, values: this.op === 'delete' ? undefined : this.values });
      }
      const injected = db.errors[key];
      if (injected) return { data: null, error: typeof injected === 'string' ? { message: injected } : { ...injected } };
      const rows = (db.tables[this.table] ??= []);

      if (this.op === 'insert') {
        const list = Array.isArray(this.values) ? this.values : [this.values];
        if (db.uniqueActiveCredential && this.table === 'verifiable_credentials') {
          const clash = list.some(
            v =>
              v.status === 'active' &&
              v.certificate_id != null &&
              rows.some(r => r.status === 'active' && r.certificate_id === v.certificate_id)
          );
          if (clash) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint "verifiable_credentials_one_active_per_certificate"' },
            };
          }
        }
        (db.inserts[this.table] ??= []).push(...list.map(v => ({ ...v })));
        rows.push(...list.map(v => ({ ...v })));
        return this.returning ? this.shape(list.map(v => ({ ...v }))) : { data: null, error: null };
      }

      let matched = rows.filter(r => this.filters.every(f => f(r)));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        matched = [...matched].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (this.limitN !== null) matched = matched.slice(0, this.limitN);

      if (this.op === 'select') return this.shape(matched.map(r => ({ ...r })));

      if (db.rlsBlocked.has(key)) matched = [];
      if (this.op === 'update') {
        matched.forEach(r => Object.assign(r, this.values));
      } else {
        db.tables[this.table] = rows.filter(r => !matched.includes(r));
      }
      return this.returning ? this.shape(matched.map(r => ({ ...r }))) : { data: null, error: null };
    }
  }

  const makeClient = (label: string) => ({
    from: (table: string) => new Query(table, label),
    auth: {
      getUser: async () => ({
        data: { user: db.user },
        error: db.user ? null : { message: 'not authenticated' },
      }),
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          db.log.push('storage.remove');
          db.storageRemoved.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
  });
  db.client = makeClient('user');
  db.adminClient = makeClient('admin');
  return db;
}

/** Deterministic valid v4 UUIDs for tests. */
export const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
