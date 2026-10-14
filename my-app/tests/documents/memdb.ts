/**
 * Tiny in-memory stand-in for the parts of the Supabase query builder used by
 * the document routes. It applies eq/in/neq/is filters for real, so row-level
 * behaviour (e.g. a conditional UPDATE matching zero rows) is genuinely exercised.
 */

type Row = Record<string, unknown>;
type Filter = { kind: 'eq' | 'neq' | 'in' | 'is'; col: string; val: unknown };

export interface LogEntry {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert';
  payload?: unknown;
  filters: Filter[];
  columns?: string;
  range?: [number, number];
  limit?: number;
  onConflict?: string;
}

export class MemDb {
  tables: Record<string, Row[]> = {};
  log: LogEntry[] = [];
  /** Called right before an UPDATE is applied (to simulate concurrent writers) */
  beforeUpdate?: (table: string, filters: Filter[]) => void;
  /** Tables whose operations fail with a Postgres-style error */
  failTables = new Set<string>();
  private seq = 0;

  constructor(public userId: string | null) {}

  seed(table: string, rows: Row[]) {
    this.tables[table] = [...(this.tables[table] ?? []), ...rows.map((r) => ({ ...r }))];
    return this;
  }

  rows(table: string) {
    return this.tables[table] ?? [];
  }

  ops(table: string, op: LogEntry['op']) {
    return this.log.filter((l) => l.table === table && l.op === op);
  }

  client() {
    return {
      auth: {
        getUser: async () =>
          this.userId
            ? { data: { user: { id: this.userId, email: 'u@test.dev' } }, error: null }
            : { data: { user: null }, error: { message: 'no session' } },
      },
      from: (table: string) => new Builder(this, table),
    };
  }

  nextId() {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col];
    switch (f.kind) {
      case 'eq':
        return v === f.val;
      case 'neq':
        return v !== f.val;
      case 'in':
        return Array.isArray(f.val) && f.val.includes(v);
      case 'is':
        return f.val === null ? v === null || v === undefined : v === f.val;
    }
  });
}

class Builder implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
  private op: LogEntry['op'] = 'select';
  private filters: Filter[] = [];
  private payload: unknown;
  private columns?: string;
  private wantsCount = false;
  private rangeV?: [number, number];
  private limitV?: number;
  private onConflict?: string;
  private returning = false;

  constructor(private db: MemDb, private table: string) {}

  select(cols?: string, opts?: { count?: string }) {
    if (this.op === 'select') this.columns = cols;
    else this.returning = true;
    if (opts?.count) this.wantsCount = true;
    return this;
  }
  insert(p: unknown) {
    this.op = 'insert';
    this.payload = p;
    return this;
  }
  update(p: unknown) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  upsert(p: unknown, opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = p;
    this.onConflict = opts?.onConflict;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ kind: 'eq', col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ kind: 'neq', col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ kind: 'in', col, val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ kind: 'is', col, val });
    return this;
  }
  or() {
    return this; // handled by the route's own JS-side re-check
  }
  order() {
    return this;
  }
  range(from: number, to: number) {
    this.rangeV = [from, to];
    return this;
  }
  limit(n: number) {
    this.limitV = n;
    return this;
  }
  maybeSingle() {
    return this.run(true, false);
  }
  single() {
    return this.run(true, true);
  }
  then<T1, T2>(
    ok?: ((v: { data: unknown; error: unknown; count: number | null }) => T1 | PromiseLike<T1>) | null,
    err?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ) {
    return this.run(false, false).then(ok, err);
  }

  private async run(one: boolean, strict: boolean) {
    const db = this.db;
    db.log.push({
      table: this.table,
      op: this.op,
      payload: this.payload,
      filters: [...this.filters],
      columns: this.columns,
      range: this.rangeV,
      limit: this.limitV,
      onConflict: this.onConflict,
    });

    if (db.failTables.has(this.table)) {
      return { data: null, error: { message: `relation "${this.table}" does not exist`, code: '42P01' }, count: null };
    }

    const table = (db.tables[this.table] ??= []);
    let result: Row[] = [];
    let count: number | null = null;

    if (this.op === 'select') {
      result = table.filter((r) => matches(r, this.filters));
      count = result.length;
      if (this.rangeV) result = result.slice(this.rangeV[0], this.rangeV[1] + 1);
      if (this.limitV !== undefined) result = result.slice(0, this.limitV);
    } else if (this.op === 'insert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const item of items) {
        const row = { id: db.nextId(), ...item };
        table.push(row);
        result.push(row);
      }
    } else if (this.op === 'update') {
      db.beforeUpdate?.(this.table, this.filters);
      for (const row of table) {
        if (matches(row, this.filters)) {
          Object.assign(row, this.payload as Row);
          result.push(row);
        }
      }
    } else if (this.op === 'upsert') {
      const item = this.payload as Row;
      const key = this.onConflict ?? 'id';
      const existing = table.find((r) => r[key] !== undefined && r[key] === item[key]);
      if (existing) {
        Object.assign(existing, item);
        result = [existing];
      } else {
        const row = { ...item };
        table.push(row);
        result = [row];
      }
    }

    const returnsRows = this.op === 'select' || this.returning;
    if (one) {
      if (!returnsRows && this.op !== 'select') return { data: null, error: null, count: null };
      if (result.length === 0) {
        return {
          data: null,
          error: strict ? { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } : null,
          count,
        };
      }
      return { data: result[0], error: null, count };
    }
    return { data: returnsRows ? result : null, error: null, count: this.wantsCount ? count : null };
  }
}
