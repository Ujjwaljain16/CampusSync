/**
 * Minimal in-memory Supabase fake for route-level tests.
 *
 * Supports the subset of the PostgREST builder the authorization code uses:
 * select / insert / update / upsert / delete, eq neq in is not gte lte match,
 * order limit range, single / maybeSingle, count + head, rpc, auth.admin.*.
 *
 * It enforces UNIQUE(user_id, organization_id) on user_roles (NULLS NOT DISTINCT)
 * like production, so tests catch accidental duplicate role rows.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Row = Record<string, any>;

interface PgError {
  code: string;
  message: string;
}

type Result = { data: any; error: PgError | null; count?: number | null };

type Filter = (row: Row) => boolean;

export interface FakeAuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

const UNIQUE: Record<string, string[]> = {
  user_roles: ['user_id', 'organization_id'],
};

class Query implements PromiseLike<Result> {
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Filter[] = [];
  private payload: any = null;
  private upsertConflict: string[] | null = null;
  private returning = false;
  private wantCount = false;
  private head = false;
  private orderBy: Array<{ col: string; asc: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === 'select') {
      this.wantCount = opts?.count === 'exact';
      this.head = !!opts?.head;
    }
    this.returning = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  update(patch: Row) {
    this.mode = 'update';
    this.payload = patch;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = payload;
    this.upsertConflict = opts?.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : null;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? null) === (val ?? null));
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? null) !== (val ?? null));
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  not(col: string, op: string, val: any) {
    if (op === 'is') this.filters.push((r) => (r[col] ?? null) !== val);
    else if (op === 'in') {
      const list: any[] = Array.isArray(val) ? val : [];
      this.filters.push((r) => !list.includes(r[col]));
    } else throw new Error(`fake: not(${op}) unsupported`);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push((r) => r[col] >= val);
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push((r) => r[col] <= val);
    return this;
  }
  match(obj: Record<string, any>) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((f) => f(row));
  }

  private finish(rows: Row[], count: number | null): Result {
    const out = rows.map((r) => ({ ...r }));
    if (this.singleMode === 'single') {
      if (out.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${out.length}` } };
      }
      return { data: out[0], error: null };
    }
    if (this.singleMode === 'maybe') {
      if (out.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      }
      return { data: out[0] ?? null, error: null };
    }
    if (this.head) return { data: null, error: null, count };
    return { data: out, error: null, count };
  }

  private violatesUnique(candidate: Row, ignore?: Row): boolean {
    const cols = UNIQUE[this.table];
    if (!cols) return false;
    return this.db.rows(this.table).some(
      (r) => r !== ignore && cols.every((c) => (r[c] ?? null) === (candidate[c] ?? null))
    );
  }

  private exec(): Result {
    const injected = this.db.failures[`${this.table}.${this.mode}`];
    if (injected) return { data: null, error: injected };
    const rows = this.db.rows(this.table);

    if (this.mode === 'select') {
      let sel = rows.filter((r) => this.matches(r));
      const count = sel.length;
      for (const o of [...this.orderBy].reverse()) {
        sel = [...sel].sort((a, b) => {
          const av = a[o.col];
          const bv = b[o.col];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (this.rangeFrom !== null && this.rangeTo !== null) sel = sel.slice(this.rangeFrom, this.rangeTo + 1);
      if (this.limitN !== null) sel = sel.slice(0, this.limitN);
      return this.finish(sel, count);
    }

    if (this.mode === 'insert' || this.mode === 'upsert') {
      const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Row[] = [];
      for (const item of list) {
        const row: Row = { ...item };
        if (this.mode === 'upsert') {
          const cols = this.upsertConflict ?? UNIQUE[this.table] ?? ['id'];
          if (this.upsertConflict && UNIQUE[this.table] &&
              cols.join() !== UNIQUE[this.table].join()) {
            return { data: null, error: { code: '42P10', message: 'no unique constraint matching ON CONFLICT' } };
          }
          const existing = rows.find((r) => cols.every((c) => (r[c] ?? null) === (row[c] ?? null)));
          if (existing) {
            Object.assign(existing, row);
            inserted.push(existing);
            continue;
          }
        }
        if (this.violatesUnique(row)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        if (this.table === 'user_roles' && row.approval_status === undefined) row.approval_status = 'approved';
        if (row.id === undefined) row.id = this.db.nextId();
        rows.push(row);
        inserted.push(row);
      }
      if (!this.returning) return { data: null, error: null };
      return this.finish(inserted, inserted.length);
    }

    if (this.mode === 'update') {
      const targets = rows.filter((r) => this.matches(r));
      for (const t of targets) {
        const next = { ...t, ...this.payload };
        if (this.violatesUnique(next, t)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        Object.assign(t, this.payload);
      }
      if (!this.returning) return { data: null, error: null };
      return this.finish(targets, targets.length);
    }

    // delete
    const removed = rows.filter((r) => this.matches(r));
    this.db.tables[this.table] = rows.filter((r) => !removed.includes(r));
    if (!this.returning) return { data: null, error: null };
    return this.finish(removed, removed.length);
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  authUsers: FakeAuthUser[] = [];
  rpcHandlers: Record<string, (args: any) => { data: any; error: PgError | null }> = {};
  rpcCalls: Array<{ name: string; args: any }> = [];
  /** failures injected per `${table}.${op}` */
  failures: Record<string, PgError> = {};
  invited: string[] = [];
  private idCounter = 0;

  /** v4-shaped id for rows inserted without one (real tables default to gen_random_uuid()). */
  nextId(): string {
    this.idCounter += 1;
    return `ffffffff-0000-4000-8000-${String(this.idCounter).padStart(12, '0')}`;
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  seed(table: string, rows: Row[]) {
    this.rows(table).push(...rows.map((r) => ({ ...r })));
    return this;
  }

  client(currentUserId: string | null = null): any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    return {
      from(table: string) {
        return new Query(db, table);
      },
      rpc(name: string, args: any) {
        db.rpcCalls.push({ name, args });
        const h = db.rpcHandlers[name];
        return Promise.resolve(h ? h(args) : { data: null, error: { code: '42883', message: `function ${name} does not exist` } });
      },
      auth: {
        getUser: async () => ({
          data: { user: currentUserId ? db.authUsers.find((u) => u.id === currentUserId) ?? { id: currentUserId, email: `${currentUserId}@x.test` } : null },
          error: currentUserId ? null : { message: 'no session' },
        }),
        admin: {
          listUsers: async (opts?: { page?: number; perPage?: number }) => {
            const page = opts?.page ?? 1;
            const perPage = opts?.perPage ?? 50;
            return { data: { users: db.authUsers.slice((page - 1) * perPage, page * perPage) }, error: null };
          },
          getUserById: async (id: string) => {
            const u = db.authUsers.find((x) => x.id === id);
            return { data: { user: u ?? null }, error: u ? null : { message: 'not found' } };
          },
          inviteUserByEmail: async (email: string) => {
            db.invited.push(email);
            const u = { id: `00000000-0000-4000-8000-${String(900000 + db.invited.length).padStart(12, '0')}`, email };
            db.authUsers.push(u);
            return { data: { user: u }, error: null };
          },
          createUser: async (attrs: { email: string }) => {
            const u = { id: `00000000-0000-4000-8000-${String(800000 + db.authUsers.length).padStart(12, '0')}`, email: attrs.email };
            db.authUsers.push(u);
            return { data: { user: u }, error: null };
          },
          deleteUser: async (id: string) => {
            db.authUsers = db.authUsers.filter((u) => u.id !== id);
            return { data: null, error: null };
          },
        },
      },
    };
  }
}

/** Deterministic v4-shaped UUIDs for tests (pass isValidUUID). */
export function uuid(n: number): string {
  return `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
