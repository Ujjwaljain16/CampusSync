/**
 * Tiny "the session changed" signal for client code.
 *
 * The session lives in HttpOnly cookies that scripts cannot read or observe, so there is no auth state
 * listener in the browser any more. Code that signs a user in or out announces it here; code that shows
 * per-user data (e.g. the organization switcher) listens, and also re-checks when the window regains focus.
 *
 * The signal is sent on the current window and, via BroadcastChannel, to other tabs of the same site.
 */

export type AuthEventKind = 'login' | 'logout';

export const AUTH_EVENT_NAME = 'campussync:auth';
const CHANNEL_NAME = 'campussync-auth';
/** Lets a window ignore its own broadcast (it already got the local event). */
const WINDOW_ID = Math.random().toString(36).slice(2);

export function emitAuthEvent(kind: AuthEventKind): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail: { kind } }));
  } catch {
    // ignore
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ kind, from: WINDOW_ID });
      channel.close();
    }
  } catch {
    // ignore
  }
}

/** Calls `handler` for events from this window and other tabs. Returns an unsubscribe function. */
export function onAuthEvent(handler: (kind: AuthEventKind) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const isKind = (v: unknown): v is AuthEventKind => v === 'login' || v === 'logout';

  const local = (e: Event) => {
    const kind = (e as CustomEvent<{ kind?: unknown }>).detail?.kind;
    if (isKind(kind)) handler(kind);
  };
  window.addEventListener(AUTH_EVENT_NAME, local);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (m: MessageEvent) => {
        const data = m.data as { kind?: unknown; from?: unknown } | null;
        if (data?.from === WINDOW_ID) return;
        if (isKind(data?.kind)) handler(data.kind);
      };
    }
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener(AUTH_EVENT_NAME, local);
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
  };
}
