// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reportError,
  reportEvent,
  redactMessage,
  resetAlertState,
  ALERT_GLOBAL_CAP,
} from '@/lib/alerts';

const HOOK = 'https://hooks.example.test/services/abc';
const ENV_KEYS = ['ALERT_WEBHOOK_URL', 'VERCEL_ENV', 'NODE_ENV'] as const;
const saved: Record<string, string | undefined> = {};

let fetchMock: ReturnType<typeof vi.fn>;

function setHook(url: string | undefined) {
  if (url === undefined) delete process.env.ALERT_WEBHOOK_URL;
  else process.env.ALERT_WEBHOOK_URL = url;
}

function bodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
}

/** An Error with a distinct first stack frame, so fingerprints differ. */
function errorAt(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  e.stack = `${name}: ${message}\n    at ${name}Handler (/app/${name}.ts:10:5)`;
  return e;
}

describe('alerts', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    resetAlertState();
    setHook(HOOK);
    fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete (process.env as Record<string, string | undefined>)[k];
      else (process.env as Record<string, string | undefined>)[k] = saved[k];
    }
  });

  describe('configuration', () => {
    it('is a no-op when ALERT_WEBHOOK_URL is unset', () => {
      setHook(undefined);
      reportError(new Error('boom'));
      reportEvent('something');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is a no-op when ALERT_WEBHOOK_URL is blank', () => {
      setHook('   ');
      reportError(new Error('boom'));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects non-https URLs', () => {
      setHook('http://hooks.example.test/x');
      reportError(new Error('boom'));
      setHook('ftp://hooks.example.test/x');
      reportError(new Error('boom 2'));
      setHook('not a url');
      reportError(new Error('boom 3'));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts compact JSON with the documented fields', async () => {
      process.env.VERCEL_ENV = 'production';
      reportError(errorAt('TypeError', 'x is undefined'), { route: '/api/things/[id]', requestId: 'req-1' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(HOOK);
      expect(init.method).toBe('POST');
      const body = bodies()[0];
      expect(body).toMatchObject({
        level: 'error',
        service: 'campussync',
        env: 'production',
        route: '/api/things/[id]',
        requestId: 'req-1',
        errorName: 'TypeError',
        message: 'x is undefined',
      });
      expect(typeof body.text).toBe('string');
      expect(typeof body.fingerprint).toBe('string');
      expect(new Date(body.time as string).toISOString()).toBe(body.time);
      expect(body).not.toHaveProperty('stack');
      expect(JSON.stringify(body)).not.toContain('Handler (/app');
    });

    it('adds a `content` field for Discord webhooks', () => {
      setHook('https://discord.com/api/webhooks/1/abc');
      reportError(new Error('boom'));
      const body = bodies()[0];
      expect(body.content).toBe(body.text);
    });

    it('does not send in a browser context', () => {
      vi.stubGlobal('window', {});
      reportError(new Error('boom'));
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('redaction', () => {
    const JWT =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const SERVICE_KEY = 'sb_secret_AbCdEf0123456789GhIjKlMnOpQrStUv';
    const HEX = 'a3f5c9d2b1e84f60a3f5c9d2b1e84f60a3f5c9d2b1e84f60';
    const B64 = 'dGhpc0lzQVNlY3JldFZhbHVlMTIzNDU2Nzg5MEFCQ0RFRkdISUo';

    it('removes emails, JWTs, bearer tokens, keys, long secrets and query strings from the posted body', () => {
      const msg = [
        'failed for student.name@college.edu',
        `jwt ${JWT}`,
        'Authorization: Bearer abc.DEF-123_xyz~tok',
        `key ${SERVICE_KEY}`,
        `SUPABASE_SERVICE_ROLE_KEY=${JWT}`,
        `hex ${HEX}`,
        `b64 ${B64}`,
        'GET https://campus.example/api/verify?token=SECRETQ&email=a@b.co',
        'path /api/x?code=123456',
        'postgres://user:pw@db.internal:5432/postgres',
      ].join(' | ');
      reportError(new Error(msg), { route: '/api/x?code=123456', requestId: 'r1' });

      const raw = (fetchMock.mock.calls[0][1] as { body: string }).body;
      for (const leaked of [
        'student.name',
        'college.edu',
        'eyJ',
        JWT.slice(10, 40),
        'abc.DEF-123_xyz~tok',
        SERVICE_KEY,
        HEX,
        B64,
        'SECRETQ',
        'a@b.co',
        'code=123456',
        'user:pw',
        'db.internal',
      ]) {
        expect(raw).not.toContain(leaked);
      }
      expect(raw).toContain('[redacted]');
      // the route is kept but its query string is stripped
      expect(bodies()[0].route).toBe('/api/x');
    });

    it('keeps ordinary text, paths and uuids readable', () => {
      const out = redactMessage('Cannot read properties of undefined (reading "id") for 3f2c1b9e-4a7d-4c5e-9b1a-0d2e8f7a6c5b at /api/certificates/upload');
      expect(out).toContain('Cannot read properties of undefined');
      expect(out).toContain('3f2c1b9e-4a7d-4c5e-9b1a-0d2e8f7a6c5b');
      expect(out).toContain('/api/certificates/upload');
    });

    it('truncates the message to 500 characters', () => {
      reportError(new Error('word '.repeat(400)));
      const body = bodies()[0];
      expect((body.message as string).length).toBeLessThanOrEqual(500);
    });

    it('never sends stacks, even when the message mentions them', () => {
      const e = errorAt('RangeError', 'bad');
      reportError(e);
      expect((fetchMock.mock.calls[0][1] as { body: string }).body).not.toContain('/app/RangeError.ts');
    });
  });

  describe('what is alerted', () => {
    it('ignores 4xx Response objects and 4xx status contexts', () => {
      reportError(new Response('nope', { status: 401 }));
      reportError(new Response('bad', { status: 400 }));
      reportError(new Response('missing', { status: 404 }));
      reportError(new Error('validation'), { status: 422 });
      reportError(Object.assign(new Error('forbidden'), { status: 403 }));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('alerts on 5xx Response objects and unexpected exceptions', () => {
      reportError(new Response('oops', { status: 500 }), { route: '/api/a' });
      reportError(errorAt('TypeError', 'kaboom'));
      reportError('a thrown string');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(bodies()[0].message).toBe('HTTP 500');
    });

    it('never throws, even for odd inputs', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(() => reportError(circular)).not.toThrow();
      expect(() => reportError(undefined)).not.toThrow();
      expect(() => reportError(null)).not.toThrow();
      fetchMock.mockImplementation(() => {
        throw new Error('sync failure');
      });
      expect(() => reportError(errorAt('E1', 'x'))).not.toThrow();
      fetchMock.mockImplementation(async () => {
        throw new Error('network down');
      });
      expect(() => reportError(errorAt('E2', 'x'))).not.toThrow();
    });

    it('reportEvent sends only whitelisted fields', () => {
      reportEvent('cert.batch.failed', {
        level: 'error',
        message: 'batch 7 failed for a@b.co',
        // @ts-expect-error extra data must be dropped
        secret: 'SHOULD-NOT-APPEAR',
      });
      const raw = (fetchMock.mock.calls[0][1] as { body: string }).body;
      expect(raw).not.toContain('SHOULD-NOT-APPEAR');
      expect(raw).not.toContain('a@b.co');
      expect(bodies()[0]).toMatchObject({ level: 'error', errorName: 'cert.batch.failed' });
    });
  });

  describe('throttling', () => {
    it('sends the same fingerprint at most once per 5 minutes', () => {
      const e = errorAt('TypeError', 'same');
      reportError(e);
      reportError(e);
      vi.advanceTimersByTime(4 * 60 * 1000);
      reportError(e);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(61 * 1000);
      reportError(e);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('treats different error types / frames as different fingerprints', () => {
      reportError(errorAt('TypeError', 'a'));
      reportError(errorAt('RangeError', 'a'));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bodies()[0].fingerprint).not.toBe(bodies()[1].fingerprint);
    });

    it('falls back to the route when there is no stack frame', () => {
      const noStack = (m: string) => Object.assign(new Error(m), { stack: undefined });
      reportError(noStack('one'), { route: '/api/a' });
      reportError(noStack('two'), { route: '/api/a' });
      reportError(noStack('three'), { route: '/api/b' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('caps the global rate at 20 per 10 minutes and reports a suppressed summary afterwards', () => {
      for (let i = 0; i < ALERT_GLOBAL_CAP; i++) reportError(errorAt(`Err${i}`, 'x'));
      expect(fetchMock).toHaveBeenCalledTimes(ALERT_GLOBAL_CAP);

      // over the cap: dropped (new fingerprints and a repeat)
      reportError(errorAt('Extra1', 'x'));
      reportError(errorAt('Extra2', 'x'));
      reportError(errorAt('Err0', 'x'));
      expect(fetchMock).toHaveBeenCalledTimes(ALERT_GLOBAL_CAP);

      // window slides
      vi.advanceTimersByTime(10 * 60 * 1000 + 1000);
      reportError(errorAt('Fresh', 'x'));
      expect(fetchMock).toHaveBeenCalledTimes(ALERT_GLOBAL_CAP + 1);
      const last = bodies()[ALERT_GLOBAL_CAP];
      expect(last.suppressed).toBe(3);
      expect(last.text).toContain('suppressed 3 similar alerts');

      // the counter is reset after it has been reported
      reportError(errorAt('Fresh2', 'x'));
      expect(bodies()[ALERT_GLOBAL_CAP + 1].suppressed).toBeUndefined();
    });

    it('reports duplicates suppressed within the fingerprint window on the next allowed alert', () => {
      const e = errorAt('TypeError', 'dup');
      reportError(e);
      reportError(e);
      reportError(e);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      reportError(e);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bodies()[1].suppressed).toBe(2);
    });
  });

  describe('delivery', () => {
    it('returns immediately and aborts a hanging request after 2 seconds', async () => {
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init.signal as AbortSignal;
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      const t0 = Date.now();
      reportError(errorAt('TypeError', 'slow webhook'));
      expect(Date.now() - t0).toBe(0); // returned synchronously, did not wait for the network
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(signal?.aborted).toBe(true);
    });

    it('swallows webhook failures without unhandled rejections', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      fetchMock.mockImplementation(async () => {
        throw new Error('ECONNRESET');
      });
      reportError(errorAt('TypeError', 'x'));
      await vi.advanceTimersByTimeAsync(10);
      process.off('unhandledRejection', unhandled);
      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});
