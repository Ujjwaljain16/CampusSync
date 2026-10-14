'use client';

import React, { useCallback } from 'react';
import { useSignedFileUrl } from '@/hooks/useSignedFileUrl';

interface CertificateFileLinkProps {
  certificateId: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

/**
 * Opens a certificate's file in a new tab through a short-lived signed URL
 * fetched when the user clicks. It replaces a plain anchor to the stored URL:
 * the bucket is private, so there is no permanent URL to link to.
 */
export function CertificateFileLink({ certificateId, className, title, children }: CertificateFileLinkProps) {
  const { getUrl, loading, error } = useSignedFileUrl(certificateId);

  const onClick = useCallback(async () => {
    // Open the tab inside the click so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const url = await getUrl();
    if (!url) {
      tab?.close();
      return;
    }
    if (tab) tab.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  }, [getUrl]);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className={`${className ?? ''}${loading ? ' opacity-60 cursor-wait' : ''}`}
        title={error ?? title}
      >
        {children}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-300">
          {error}
        </span>
      )}
    </>
  );
}

export default CertificateFileLink;
