import { describe, it, expect } from 'vitest';
import { success, error, apiError } from '@/lib/api/utils/response';
import { isValidEmail, isValidUUID } from '@/lib/api/utils/validation';

describe('success()', () => {
  it('returns 200 with the data envelope by default', async () => {
    const res = success({ test: 'data' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { test: 'data' } });
  });

  it('includes the message and honours a custom status', async () => {
    const res = success({ id: 1 }, 'created', 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: 1 }, message: 'created' });
  });
});

describe('error() / apiError', () => {
  it('error() defaults to 500 and only includes details when given', async () => {
    const plain = error('boom');
    expect(plain.status).toBe(500);
    expect(await plain.json()).toEqual({ error: 'boom' });

    const detailed = error('boom', 500, { field: 'x' });
    expect(await detailed.json()).toEqual({ error: 'boom', details: { field: 'x' } });
  });

  it('maps helpers to the expected HTTP status codes', () => {
    expect(apiError.badRequest('x').status).toBe(400);
    expect(apiError.unauthorized().status).toBe(401);
    expect(apiError.forbidden().status).toBe(403);
    expect(apiError.notFound().status).toBe(404);
    expect(apiError.validation('x').status).toBe(422);
    expect(apiError.internal().status).toBe(500);
  });

  it('uses sensible default messages', async () => {
    expect(await apiError.unauthorized().json()).toEqual({ error: 'Unauthorized' });
    expect(await apiError.forbidden().json()).toEqual({ error: 'Forbidden' });
  });
});

describe('validation helpers', () => {
  it('isValidEmail accepts well-formed and rejects malformed addresses', () => {
    expect(isValidEmail('student@college.edu')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });

  it('isValidUUID accepts v4 UUIDs and rejects other strings', () => {
    expect(isValidUUID('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('')).toBe(false);
  });
});
