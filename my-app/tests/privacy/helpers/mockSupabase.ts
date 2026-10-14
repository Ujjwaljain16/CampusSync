/**
 * Tiny chainable Supabase query-builder mock for route tests.
 *
 * Every `from(table)` call creates a recorder. The handler for that table gets
 * the recorded operations and returns `{ data, error, count }`. The same
 * result is produced whether the chain is awaited directly or ended with
 * `.single()` / `.maybeSingle()` (those unwrap the first row).
 */

export interface Op {
  method: string;
  args: unknown[];
}

export interface QueryState {
  table: string;
  ops: Op[];
  /** First op that is select/insert/update/upsert/delete */
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  /** value of the first .eq(column, v) call for `column` */
  eq(column: string): unknown;
  has(method: string, column?: string): boolean;
  find(method: string, column?: string): Op | undefined;
}

export interface QueryResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
}

export type TableHandler = (state: QueryState) => QueryResult | Promise<QueryResult>;

export interface MockClient {
  from: (table: string) => unknown;
  auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string } | null }; error: null | { message: string } }> };
  /** every query issued, in order */
  calls: QueryState[];
  callsFor(table: string): QueryState[];
}

function makeState(table: string, ops: Op[]): QueryState {
  const actionOp = ops.find((o) => ['select', 'insert', 'update', 'upsert', 'delete'].includes(o.method));
  // `.insert(x).select()` is still an insert
  const writeOp = ops.find((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.method));
  const op = writeOp ?? actionOp;
  return {
    table,
    ops,
    action: (op?.method as QueryState['action']) ?? 'select',
    payload: writeOp?.args[0],
    eq: (column) => ops.find((o) => o.method === 'eq' && o.args[0] === column)?.args[1],
    has: (method, column) => ops.some((o) => o.method === method && (column === undefined || o.args[0] === column)),
    find: (method, column) => ops.find((o) => o.method === method && (column === undefined || o.args[0] === column)),
  };
}

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt',
  'or', 'ilike', 'like', 'order', 'range', 'limit', 'contains',
];

export function createMockClient(
  handlers: Record<string, TableHandler>,
  user: { id: string; email?: string } | null = null
): MockClient {
  const calls: QueryState[] = [];

  const from = (table: string) => {
    const ops: Op[] = [];
    const run = async (unwrap: boolean) => {
      const state = makeState(table, ops);
      calls.push(state);
      const handler = handlers[table];
      const result: QueryResult = handler ? await handler(state) : { data: [], error: null };
      let data = result.data === undefined ? [] : result.data;
      if (unwrap && Array.isArray(data)) data = data[0] ?? null;
      return { data, error: result.error ?? null, count: result.count ?? null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of CHAIN_METHODS) {
      chain[m] = (...args: unknown[]) => {
        ops.push({ method: m, args });
        return chain;
      };
    }
    chain.single = () => run(true);
    chain.maybeSingle = () => run(true);
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run(false).then(resolve, reject);
    return chain;
  };

  return {
    from,
    auth: {
      getUser: async () =>
        user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'not authenticated' } },
    },
    calls,
    callsFor: (table: string) => calls.filter((c) => c.table === table),
  };
}

/** `in` values of the first `.in(column, values)` call. */
export function inValues(state: QueryState, column: string): unknown[] {
  const op = state.find('in', column);
  return Array.isArray(op?.args[1]) ? (op!.args[1] as unknown[]) : [];
}
