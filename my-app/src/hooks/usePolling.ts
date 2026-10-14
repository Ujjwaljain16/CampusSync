'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_INTERVAL_MS = 10_000;
export const POLL_HIDDEN_INTERVAL_MS = 60_000;
export const POLL_MAX_BACKOFF_MS = 120_000;

export interface PollingOptions {
  /** Delay between polls while the tab is visible. Default 10 s. */
  intervalMs?: number;
  /** Delay between polls while the tab is hidden. Default 60 s. */
  hiddenIntervalMs?: number;
  /** Upper bound for the delay after consecutive failures (it doubles per failure). Default 120 s. */
  maxBackoffMs?: number;
  /** Pause everything when false. Default true. */
  enabled?: boolean;
}

/**
 * Calls `poll` now, then again every `intervalMs` (slower while the tab is hidden, slower again after
 * failures), until the component unmounts or `poll` resolves to `false`.
 *
 * - polls never overlap
 * - when the tab becomes visible again it polls immediately
 * - a thrown / rejected poll counts as a failure: the delay doubles up to `maxBackoffMs`; the next success
 *   resets it
 * - timers and the visibility listener are removed on unmount
 *
 * This replaces the old browser realtime subscription: the session is not readable from script any more,
 * so the page asks the server instead.
 *
 * Returns `healthy` (the last poll succeeded) and `pollNow()` for a manual refresh.
 */
export function usePolling(
  poll: () => Promise<boolean | void> | boolean | void,
  options: PollingOptions = {}
): { healthy: boolean; pollNow: () => Promise<void> } {
  const {
    intervalMs = POLL_INTERVAL_MS,
    hiddenIntervalMs = POLL_HIDDEN_INTERVAL_MS,
    maxBackoffMs = POLL_MAX_BACKOFF_MS,
    enabled = true,
  } = options;

  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  });

  const [healthy, setHealthy] = useState(false);
  const runRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const nextDelay = () => {
      const base = isHidden() ? hiddenIntervalMs : intervalMs;
      return Math.min(base * 2 ** failures, Math.max(base, maxBackoffMs));
    };

    const schedule = () => {
      clear();
      if (stopped) return;
      timer = setTimeout(run, nextDelay());
    };

    async function run() {
      clear();
      if (stopped || running) return;
      running = true;
      let keepGoing = true;
      try {
        const result = await pollRef.current();
        failures = 0;
        if (!stopped) setHealthy(true);
        if (result === false) keepGoing = false;
      } catch {
        failures += 1;
        if (!stopped) setHealthy(false);
      } finally {
        running = false;
      }
      if (!keepGoing) {
        stopped = true;
        return;
      }
      schedule();
    }

    const onVisibility = () => {
      if (stopped) return;
      if (isHidden()) {
        // slow down: re-arm the timer with the hidden delay (an in-flight poll re-arms itself when it ends)
        if (!running) schedule();
      } else {
        // back on screen: look right away
        void run();
      }
    };

    runRef.current = () => run();
    document.addEventListener('visibilitychange', onVisibility);
    void run();

    return () => {
      stopped = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
      runRef.current = async () => undefined;
    };
  }, [enabled, intervalMs, hiddenIntervalMs, maxBackoffMs]);

  const pollNow = useCallback(() => runRef.current(), []);
  return { healthy, pollNow };
}
