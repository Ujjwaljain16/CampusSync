import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePolling } from '@/hooks/usePolling';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});
afterEach(() => {
  vi.useRealTimers();
});

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('usePolling', () => {
  it('polls once immediately and then every 10 seconds', async () => {
    const poll = vi.fn(async () => true);
    renderHook(() => usePolling(poll));
    await tick(0);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(9_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(poll).toHaveBeenCalledTimes(2);
    await tick(10_000);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('backs off to 60 seconds while the tab is hidden and polls right away when it is shown again', async () => {
    const poll = vi.fn(async () => true);
    renderHook(() => usePolling(poll));
    await tick(0);
    expect(poll).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('hidden'));
    await tick(59_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(poll).toHaveBeenCalledTimes(2);

    await act(async () => setVisibility('visible'));
    await tick(0);
    expect(poll).toHaveBeenCalledTimes(3); // immediately on return
    await tick(10_000);
    expect(poll).toHaveBeenCalledTimes(4); // and back to the 10 s rhythm
  });

  it('starts hidden at the slow rate', async () => {
    setVisibility('hidden');
    const poll = vi.fn(async () => true);
    renderHook(() => usePolling(poll));
    await tick(0);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('doubles the delay after each failure (capped) and resets after a success', async () => {
    let fail = true;
    const poll = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return true;
    });
    const { result } = renderHook(() => usePolling(poll));
    await tick(0);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(result.current.healthy).toBe(false);

    await tick(19_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(1); // 20 s after the first failure
    expect(poll).toHaveBeenCalledTimes(2);

    await tick(39_999);
    expect(poll).toHaveBeenCalledTimes(2);
    await tick(1); // 40 s after the second
    expect(poll).toHaveBeenCalledTimes(3);

    fail = false;
    await tick(80_000); // 4th failure delay would be 80 s
    expect(poll).toHaveBeenCalledTimes(4);
    expect(result.current.healthy).toBe(true);

    await tick(10_000); // back to normal after the success
    expect(poll).toHaveBeenCalledTimes(5);
  });

  it('never waits longer than the cap after repeated failures', async () => {
    const poll = vi.fn(async () => {
      throw new Error('offline');
    });
    renderHook(() => usePolling(poll));
    await tick(0);
    for (let i = 0; i < 8; i++) await tick(120_000);
    const before = poll.mock.calls.length;
    await tick(120_000);
    expect(poll.mock.calls.length).toBe(before + 1);
  });

  it('stops for good when a poll resolves to false', async () => {
    const poll = vi.fn(async () => false);
    renderHook(() => usePolling(poll));
    await tick(0);
    expect(poll).toHaveBeenCalledTimes(1);
    await tick(300_000);
    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    await tick(300_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('does not start a second poll while one is still running', async () => {
    let release: () => void = () => undefined;
    const poll = vi.fn(() => new Promise<boolean>((resolve) => { release = () => resolve(true); }));
    renderHook(() => usePolling(poll));
    await tick(0);
    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    await tick(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await tick(10_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('cleans up on unmount: no timers, no further polls, listener removed', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const poll = vi.fn(async () => true);
    const { unmount } = renderHook(() => usePolling(poll));
    await tick(0);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    await tick(120_000);
    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('an in-flight poll that finishes after unmount does not schedule another', async () => {
    let release: () => void = () => undefined;
    const poll = vi.fn(() => new Promise<boolean>((resolve) => { release = () => resolve(true); }));
    const { unmount } = renderHook(() => usePolling(poll));
    await tick(0);
    unmount();
    await act(async () => release());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pollNow() polls immediately and resolves when done', async () => {
    const poll = vi.fn(async () => true);
    const { result } = renderHook(() => usePolling(poll));
    await tick(0);
    await act(async () => { await result.current.pollNow(); });
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('uses the latest poll function without restarting the timer', async () => {
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);
    const { rerender } = renderHook(({ fn }) => usePolling(fn), { initialProps: { fn: first } });
    await tick(0);
    rerender({ fn: second });
    await tick(10_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', async () => {
    const poll = vi.fn(async () => true);
    renderHook(() => usePolling(poll, { enabled: false }));
    await tick(60_000);
    expect(poll).not.toHaveBeenCalled();
  });

  it('honours custom intervals', async () => {
    const poll = vi.fn(async () => true);
    renderHook(() => usePolling(poll, { intervalMs: 1_000 }));
    await tick(0);
    await tick(3_000);
    expect(poll).toHaveBeenCalledTimes(4);
  });
});
