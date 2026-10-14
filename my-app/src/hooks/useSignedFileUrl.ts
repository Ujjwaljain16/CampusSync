'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetchJson } from '@/lib/apiClient';

export type SignedFileStatus = 'idle' | 'loading' | 'error';

/** Only ever hand http(s) URLs to the browser, whatever the server said. */
export function isOpenableUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * On-demand access to a certificate's file. The bucket is private, so there is
 * no permanent URL: `getUrl()` asks the server (which checks authorization) for
 * a short-lived signed URL each time. Nothing is cached; a signed URL expires
 * after a few minutes.
 */
export function useSignedFileUrl(certificateId: string) {
  const [status, setStatus] = useState<SignedFileStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const getUrl = useCallback(async (): Promise<string | null> => {
    setStatus('loading');
    setError(null);
    try {
      const data = await apiFetchJson<{ url?: string }>(
        `/api/certificates/${encodeURIComponent(certificateId)}/file`,
        { cache: 'no-store' }
      );
      if (!isOpenableUrl(data?.url)) throw new Error('bad response');
      if (mounted.current) setStatus('idle');
      return data.url;
    } catch {
      // Never surface server/storage text; one generic message.
      if (mounted.current) {
        setStatus('error');
        setError('File unavailable');
      }
      return null;
    }
  }, [certificateId]);

  return { getUrl, status, loading: status === 'loading', error };
}
