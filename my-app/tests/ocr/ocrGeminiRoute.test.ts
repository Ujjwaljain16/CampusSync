// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateContent = vi.fn();
const upload = vi.fn();
const getPublicUrl = vi.fn();
const getServerUserWithRole = vi.fn();
let modelNameUsed: string | undefined;
let currentUserId = 'user-1';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(opts: { model: string }) {
      modelNameUsed = opts.model;
      return { generateContent: (...a: unknown[]) => generateContent(...a) };
    }
  },
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => upload(...a),
        getPublicUrl: (...a: unknown[]) => getPublicUrl(...a),
      }),
    },
  })),
  getServerUserWithRole: (...a: unknown[]) => getServerUserWithRole(...a),
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function call(content: Uint8Array, opts: { name?: string; type?: string; length?: number } = {}) {
  const { POST } = await import('@/app/api/certificates/ocr-gemini/route');
  const form = new FormData();
  form.append('file', new File([content as unknown as BlobPart], opts.name ?? 'cert.png', { type: opts.type ?? 'image/png' }));
  // Serialise the multipart body so we can set Content-Length like a browser does
  const probe = new Request('http://localhost/api/certificates/ocr-gemini', { method: 'POST', body: form });
  const raw = await probe.arrayBuffer();
  const headers = new Headers({
    'content-type': probe.headers.get('content-type') ?? '',
    'content-length': String(opts.length ?? raw.byteLength),
  });
  const req = new Request(probe.url, { method: 'POST', headers, body: raw });
  return POST(req as never);
}

const geminiText = (obj: unknown) => ({ response: { text: () => JSON.stringify(obj) } });

describe('POST /api/certificates/ocr-gemini', () => {
  let userCounter = 0;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;
    modelNameUsed = undefined;
    // a distinct user per test keeps the in-memory rate limiter from interfering
    userCounter += 1;
    currentUserId = `user-${userCounter}`;
    getServerUserWithRole.mockResolvedValue({
      user: { id: `user-${userCounter}` },
      role: 'student',
      approvalStatus: 'approved',
      organizationId: 'org-1',
    });
    upload.mockResolvedValue({ data: { path: 'user-1/file.png' }, error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.test/certificates/user-1/file.png' } });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.GEMINI_API_KEY;
  });

  it('rejects a spoofed MIME type without calling Gemini or storage', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const res = await call(html, { name: 'cert.png', type: 'image/png' });

    expect(res.status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects an extension that disagrees with the content', async () => {
    const res = await call(PNG, { name: 'cert.html', type: 'image/png' });
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies from Content-Length before parsing', async () => {
    const res = await call(PNG, { length: 50 * 1024 * 1024 });
    expect(res.status).toBe(413);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('only allows approved students that belong to an organization', async () => {
    getServerUserWithRole.mockResolvedValueOnce({ user: { id: 'f' }, role: 'faculty', approvalStatus: 'approved', organizationId: 'org-1' });
    expect((await call(PNG)).status).toBe(403);

    getServerUserWithRole.mockResolvedValueOnce({ user: { id: 's' }, role: 'student', approvalStatus: 'approved' });
    expect((await call(PNG)).status).toBe(403);

    expect(generateContent).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('calls Gemini first and uploads only after a successful parse; normalizes output', async () => {
    const order: string[] = [];
    generateContent.mockImplementation(async () => {
      order.push('gemini');
      return geminiText({
        title: ' Intro\u0000 to ML ',
        institution: 'MIT',
        recipient: 'Ada',
        date_issued: 'next tuesday',
        description: 'd'.repeat(5000),
        raw_text: 'RAW',
        confidence: 7,
      });
    });
    upload.mockImplementation(async () => {
      order.push('upload');
      return { data: { path: 'user-1/file.png' }, error: null };
    });

    const res = await call(PNG);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(order).toEqual(['gemini', 'upload']);
    expect(modelNameUsed).toBe('gemini-2.0-flash');
    expect(body.data.publicUrl).toBe('https://storage.test/certificates/user-1/file.png');
    expect(body.data.filePath).toBe('user-1/file.png');
    expect(body.data.ocr.title).toBe('Intro to ML');
    expect(body.data.ocr.description).toHaveLength(2000);
    expect(body.data.ocr.date_issued).toBeNull();
    expect(body.data.ocr.confidence).toBe(1);
    expect(body.data.ocr.extracted_fields.date_issued).toBeNull();
  });

  it('does not fabricate confidence and keeps a valid ISO date', async () => {
    generateContent.mockResolvedValue(geminiText({ title: 'T', institution: 'I', date_issued: '2024-05-01' }));

    const body = await (await call(PNG)).json();

    expect(body.data.ocr.confidence).toBeNull();
    expect(body.data.ocr.date_issued).toBe('2024-05-01');
  });

  it('honours GEMINI_MODEL', async () => {
    process.env.GEMINI_MODEL = 'gemini-custom';
    generateContent.mockResolvedValue(geminiText({ title: 'T' }));
    await call(PNG);
    expect(modelNameUsed).toBe('gemini-custom');
  });

  it('does not upload when Gemini times out', async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => {})); // never resolves

    const pending = call(PNG);
    await vi.advanceTimersByTimeAsync(30_000);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(upload).not.toHaveBeenCalled();
  });

  it('does not upload when Gemini fails or returns unparseable output', async () => {
    generateContent.mockRejectedValueOnce(new Error('quota'));
    expect((await call(PNG)).status).toBe(502);

    generateContent.mockResolvedValueOnce({ response: { text: () => 'sorry, no json here' } });
    expect((await call(PNG)).status).toBe(422);

    expect(upload).not.toHaveBeenCalled();
  });

  it('returns an error when the upload fails after a successful OCR', async () => {
    generateContent.mockResolvedValue(geminiText({ title: 'T' }));
    upload.mockResolvedValue({ data: null, error: { message: 'bucket error' } });

    const res = await call(PNG);

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('bucket error');
  });

  it('is unavailable (503) without a Gemini key and stores nothing', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await call(PNG);
    expect(res.status).toBe(503);
    expect(upload).not.toHaveBeenCalled();
  });
});
