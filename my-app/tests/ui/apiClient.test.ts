// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiFetchJson, unwrapData } from '@/lib/apiClient';
import { parseSignupParams, parseSignupRole } from '@/lib/signupQuery';
import { MAX_UPLOAD_BYTES, validateUploadFile } from '@/lib/uploadValidation';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('unwrapData', () => {
  it('unwraps the { data } envelope', () => {
    expect(unwrapData<{ a: number }>({ data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapData<number[]>({ data: [1, 2] })).toEqual([1, 2]);
    expect(unwrapData<number>({ data: 0 })).toBe(0);
  });

  it('returns raw payloads untouched', () => {
    expect(unwrapData<{ a: number }>({ a: 1 })).toEqual({ a: 1 });
    expect(unwrapData<number[]>([1, 2])).toEqual([1, 2]);
    expect(unwrapData<null>(null)).toBeNull();
    expect(unwrapData<string>('x')).toBe('x');
  });

  it('falls back to the whole object when data is null/undefined', () => {
    expect(unwrapData({ data: null, message: 'm' })).toEqual({ data: null, message: 'm' });
  });
});

describe('apiFetchJson', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    const store = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unwrapped data for enveloped responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: '1' } }));
    await expect(apiFetchJson<{ id: string }>('/api/x')).resolves.toEqual({ id: '1' });
  });

  it('returns raw JSON for un-enveloped responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ requests: [] }));
    await expect(apiFetchJson('/api/x')).resolves.toEqual({ requests: [] });
  });

  it('throws ApiError with status and server message on non-OK', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Nope', details: { field: 'a' } }, { status: 403 }));
    const err = (await apiFetchJson('/api/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Nope');
    expect(err.details).toEqual({ field: 'a' });
  });

  it('uses a stable message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>boom</html>', { status: 502 }));
    const err = (await apiFetchJson('/api/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.message).toBe('Request failed (502)');
  });

  it('throws ApiError for a 200 with a non-JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(apiFetchJson('/api/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('tolerates 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetchJson('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('attaches X-Organization-ID when one is selected, without overriding an explicit header', async () => {
    localStorage.setItem('selectedOrganizationId', 'org-1');
    fetchMock.mockImplementation(async () => jsonResponse({ data: 1 }));

    await apiFetchJson('/api/x');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Organization-ID')).toBe('org-1');

    await apiFetchJson('/api/x', { headers: { 'X-Organization-ID': 'explicit' } });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-Organization-ID')).toBe('explicit');
  });

  it('sends no org header when none is selected', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: 1 }));
    await apiFetchJson('/api/x');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('X-Organization-ID')).toBe(false);
  });
});

describe('parseSignupParams', () => {
  it('allow-lists roles', () => {
    expect(parseSignupRole('student')).toBe('student');
    expect(parseSignupRole('faculty')).toBe('faculty');
    expect(parseSignupRole('recruiter')).toBe('recruiter');
    expect(parseSignupRole('admin')).toBeNull();
    expect(parseSignupRole('super_admin')).toBeNull();
    expect(parseSignupRole('<script>')).toBeNull();
    expect(parseSignupRole(null)).toBeNull();
  });

  it('only accepts oauth=true and plausible emails', () => {
    expect(parseSignupParams('?role=admin&email=a@b.co&oauth=true')).toEqual({ role: null, email: 'a@b.co', oauth: true });
    expect(parseSignupParams('?oauth=1&email=not-an-email')).toEqual({ role: null, email: null, oauth: false });
    expect(parseSignupParams('?role=recruiter')).toEqual({ role: 'recruiter', email: null, oauth: false });
    expect(parseSignupParams(`?email=${'a'.repeat(300)}@b.co`).email).toBeNull();
  });
});

describe('validateUploadFile', () => {
  it('accepts pdf and images within the limit', () => {
    expect(validateUploadFile({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(validateUploadFile({ type: 'image/png', size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it('rejects other types, empty and oversized files', () => {
    expect(validateUploadFile({ type: 'application/zip', size: 10 })).toMatch(/Unsupported/);
    expect(validateUploadFile({ type: '', size: 10 })).toMatch(/Unsupported/);
    expect(validateUploadFile({ type: 'image/png', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/too large/);
    expect(validateUploadFile({ type: 'image/png', size: 0 })).toMatch(/empty/);
  });
});
