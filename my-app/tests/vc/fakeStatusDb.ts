/**
 * In-memory stand-in for the vc_status_lists table and its two SQL functions
 * (allocate_status_index, set_status_bit), following the semantics of
 * supabase/migrations/20261014_vc_status_lists.sql. Only the calls statusList.ts makes are supported.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StatusListDb } from '@/lib/statusList';

export interface FakeList {
  id: string;
  purpose: string;
  bytes: Uint8Array;
  nextIndex: number;
  size: number;
  updatedAt: string;
}

export interface FakeStatusDb {
  lists: Map<string, FakeList>;
  calls: string[];
  /** Make every call fail with this Postgres/PostgREST code (e.g. '42P01'). */
  failWith: string | null;
  client: StatusListDb & Record<string, any>;
}

export function createFakeStatusDb(opts: { size?: number } = {}): FakeStatusDb {
  const size = opts.size ?? 131072;
  const state: FakeStatusDb = { lists: new Map(), calls: [], failWith: null, client: null as any };
  let tick = 0;
  const touch = (l: FakeList) => {
    l.updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString();
  };
  const err = () => ({ data: null, error: { code: state.failWith, message: 'simulated failure' } });

  state.client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, id: string) {
              return {
                maybeSingle: async () => {
                  state.calls.push(`select:${table}:${id}`);
                  if (state.failWith) return err();
                  const l = state.lists.get(id);
                  if (!l) return { data: null, error: null };
                  return {
                    data: {
                      id: l.id,
                      purpose: l.purpose,
                      bits: Buffer.from(l.bytes).toString('base64'),
                      next_index: l.nextIndex,
                      size: l.size,
                      updated_at: l.updatedAt,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
    rpc: async (fn: string, args: Record<string, any>) => {
      state.calls.push(`rpc:${fn}`);
      if (state.failWith) return err();
      if (fn === 'allocate_status_index') {
        let l = state.lists.get(args.list_id);
        if (!l) {
          l = { id: args.list_id, purpose: 'revocation', bytes: new Uint8Array(size / 8), nextIndex: 0, size, updatedAt: '' };
          touch(l);
          state.lists.set(l.id, l);
        }
        if (l.nextIndex >= l.size) return { data: null, error: null }; // full
        l.nextIndex += 1;
        touch(l);
        return { data: l.nextIndex - 1, error: null };
      }
      if (fn === 'set_status_bit') {
        const l = state.lists.get(args.list_id);
        const i = args.bit_index as number;
        if (!l || i < 0 || i >= l.nextIndex || i >= l.size) return { data: false, error: null };
        l.bytes[i >> 3] |= 1 << (7 - (i & 7));
        touch(l);
        return { data: true, error: null };
      }
      return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
    },
  } as any;
  return state;
}
