// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetAlertState } from '@/lib/alerts';
import { onRequestError } from '@/instrumentation';

const HOOK = 'https://hooks.example.test/services/abc';

describe('instrumentation onRequestError', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedHook = process.env.ALERT_WEBHOOK_URL;

  beforeEach(() => {
    resetAlertState();
    process.env.ALERT_WEBHOOK_URL = HOOK;
    fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedHook === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = savedHook;
  });

  const request = {
    path: '/api/certificates/123?token=SECRETQUERY&email=a@b.co',
    method: 'POST',
    headers: { authorization: 'Bearer HEADERSECRET', cookie: 'sb-access-token=COOKIESECRET' },
  };
  const context = { routerKind: 'App Router', routePath: '/api/certificates/[id]', routeType: 'route' } as const;

  it('reports the route pattern, router kind and route type, but not the query string or headers', async () => {
    const err = Object.assign(new TypeError('Cannot read properties of undefined'), { digest: 'dig123' });
    await onRequestError(err, request, context);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const raw = (fetchMock.mock.calls[0][1] as { body: string }).body;
    const body = JSON.parse(raw);
    expect(body).toMatchObject({
      level: 'error',
      route: '/api/certificates/[id]',
      routerKind: 'App Router',
      routeType: 'route',
      requestId: 'dig123',
      errorName: 'TypeError',
    });
    for (const leaked of ['SECRETQUERY', 'a@b.co', 'HEADERSECRET', 'COOKIESECRET', 'authorization', 'cookie', '/api/certificates/123']) {
      expect(raw).not.toContain(leaked);
    }
    expect(body).not.toHaveProperty('stack');
  });

  it('ignores redirect and not-found control-flow errors', async () => {
    await onRequestError(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }), request, context);
    await onRequestError(Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' }), request, context);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a thrown 4xx Response and alerts on a thrown 5xx Response', async () => {
    await onRequestError(new Response('no', { status: 403 }), request, context);
    expect(fetchMock).not.toHaveBeenCalled();
    await onRequestError(new Response('bad', { status: 502 }), request, context);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when nothing is configured', async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    await expect(onRequestError(new Error('x'), request, context)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
