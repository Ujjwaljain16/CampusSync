// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const reportErrorMock = vi.fn();
vi.mock('@/lib/alerts', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

import { logger } from '@/lib/logger';

describe('logger.error -> alerts', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards Error objects and keeps the console output unchanged', () => {
    const err = new Error('db exploded');
    logger.error('Failed to save', err, { userId: 'u1', route: '/api/save', requestId: 'r-9' });

    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(err, {
      logMessage: 'Failed to save',
      route: '/api/save',
      requestId: 'r-9',
      status: undefined,
    });

    expect(errSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = errSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe('[ERROR] Failed to save');
    expect(payload).toMatchObject({
      error: { name: 'Error', message: 'db exploded', stack: err.stack },
      context: { userId: 'u1', route: '/api/save', requestId: 'r-9' },
    });
  });

  it('forwards bare messages without an error object', () => {
    logger.error('Something odd happened');
    expect(reportErrorMock).toHaveBeenCalledWith(undefined, expect.objectContaining({ logMessage: 'Something odd happened' }));
  });

  it('does not forward warn / log / security events', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('careful');
    logger.log('fyi');
    logger.security('failed login');
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('does not forward a second time when reporting itself logs an error (recursion guard)', () => {
    reportErrorMock.mockImplementation(() => {
      logger.error('alert transport failed', new Error('inner'));
    });
    logger.error('outer failure', new Error('outer'));
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    // both calls were still logged to the console
    expect(errSpy).toHaveBeenCalledTimes(2);

    // and the guard is released afterwards
    reportErrorMock.mockReset();
    logger.error('later failure', new Error('later'));
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it('never lets an alerting failure escape into the caller', () => {
    reportErrorMock.mockImplementation(() => {
      throw new Error('alerts are broken');
    });
    expect(() => logger.error('x', new Error('y'))).not.toThrow();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
