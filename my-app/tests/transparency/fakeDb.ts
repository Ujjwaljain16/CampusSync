/**
 * Minimal in-memory stand-in for the slice of the Supabase client the transparency log uses.
 * It mimics the semantics that matter for correctness (contiguous index assignment inside
 * `tlog_append`, primary-key conflicts, filters/ordering/limits), NOT Postgres itself - the SQL
 * migration is a draft that has to be reviewed/applied against a real database.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const colValue = (r: Row, col: string): unknown => {
  const m = /^(\w+)->>(\w+)$/.exec(col);
  if (m) return ((r[m[1]] as Row | undefined) ?? {})[m[2]];
  return r[col];
};

export interface FakeDbOptions {
  /** When set, every call fails with this Postgres/PostgREST error code. */
  failWith?: string;
}

export class FakeDb {
  tables: Record<string, Row[]> = {
    tlog_entries: [],
    tlog_tree_heads: [],
    verifiable_credentials: [],
    certificates: [],
  };
  /** `[from, to)` ranges requested from tlog_entries via gte/lt (to measure how much is re-read). */
  leafRangeReads: Array<[number, number]> = [];
  failWith?: string;
  rpcCalls = 0;

  constructor(opts: FakeDbOptions = {}) {
    this.failWith = opts.failWith;
  }

  private err() {
    return this.failWith ? { code: this.failWith, message: 'simulated' } : null;
  }

  from(table: string) {
    return new Query(this, table);
  }

  async rpc(fn: string, args: { entry: Row; leaf_hash: string }) {
    this.rpcCalls++;
    await Promise.resolve();
    if (this.failWith) return { data: null, error: this.err() };
    if (fn !== 'tlog_append') return { data: null, error: { code: '42883', message: 'no such function' } };
    if (!/^[0-9a-f]{64}$/.test(args.leaf_hash)) return { data: null, error: { code: '22023', message: 'bad hash' } };
    const rows = this.tables.tlog_entries;
    // mirror of the SQL function: next index = max + 1 (single writer at a time)
    const next = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.leaf_index as number)) + 1;
    rows.push({ leaf_index: next, leaf_hash: args.leaf_hash, entry: JSON.parse(JSON.stringify(args.entry)), created_at: new Date().toISOString() });
    return { data: next, error: null };
  }

  /** @internal */
  _insert(table: string, row: Row) {
    if (this.failWith) return { error: this.err() };
    if (table === 'tlog_tree_heads') {
      if (this.tables[table].some((r) => r.tree_size === row.tree_size)) return { error: { code: '23505', message: 'duplicate' } };
    }
    this.tables[table].push(JSON.parse(JSON.stringify(row)));
    return { error: null };
  }
}

class Query implements PromiseLike<{ data: Row[] | Row | null; error: unknown }> {
  private filters: Filter[] = [];
  private orderCol?: string;
  private asc = true;
  private lim?: number;
  private range: [number | undefined, number | undefined] = [undefined, undefined];
  private single = false;
  private pendingInsert?: Row;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_cols?: string) {
    void _cols;
    return this;
  }
  insert(row: Row) {
    this.pendingInsert = row;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => colValue(r, col) === v);
    return this;
  }
  gte(col: string, v: number) {
    this.filters.push((r) => (colValue(r, col) as number) >= v);
    if (col === 'leaf_index') this.range[0] = v;
    return this;
  }
  lt(col: string, v: number) {
    this.filters.push((r) => (colValue(r, col) as number) < v);
    if (col === 'leaf_index') this.range[1] = v;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.asc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private exec(): { data: Row[] | Row | null; error: unknown } {
    if (this.pendingInsert) return this.db._insert(this.table, this.pendingInsert) as { data: null; error: unknown };
    if (this.db.failWith) return { data: null, error: { code: this.db.failWith, message: 'simulated' } };
    if (this.table === 'tlog_entries' && this.range[0] !== undefined && this.range[1] !== undefined) {
      this.db.leafRangeReads.push([this.range[0], this.range[1]]);
    }
    let rows = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const c = this.orderCol;
      rows = [...rows].sort((a, b) => ((colValue(a, c) as number) - (colValue(b, c) as number)) * (this.asc ? 1 : -1));
    }
    if (this.lim !== undefined) rows = rows.slice(0, this.lim);
    // PostgREST returns at most 1000 rows by default
    rows = rows.slice(0, 1000);
    rows = rows.map((r) => JSON.parse(JSON.stringify(r)));
    if (this.single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then<R1 = { data: Row[] | Row | null; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: Row[] | Row | null; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.exec()).then(onfulfilled, onrejected);
  }
}
