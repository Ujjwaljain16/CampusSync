import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Transparency log',
  description:
    'Publicly verifiable, append-only log of credential issue and revoke events, with signed tree heads and Merkle proofs you can check in your browser.',
};

export default function TransparencyLayout({ children }: { children: ReactNode }) {
  return children;
}
