'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { apiFetch, apiFetchJson, ApiError } from '@/lib/apiClient';

interface PrivacyProfile {
  full_name?: string | null;
  public_portfolio_enabled: boolean;
  recruiter_share_contact: boolean;
}

type Notice = { kind: 'success' | 'error' | 'warning'; text: string } | null;

/**
 * Student-controlled visibility. Both switches default to OFF:
 *  - public portfolio: anyone with the link can see your VERIFIED certificates (title, institution, date).
 *  - recruiter contact sharing: approved recruiters of your organisation may see your email, phone,
 *    GPA and profile links. Without it they only see verified certificates and basic profile fields.
 */
export default function StudentPrivacyPage() {
  const portfolioId = useId();
  const contactId = useId();
  const [profile, setProfile] = useState<PrivacyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetchJson<PrivacyProfile>('/api/profile/complete');
      setProfile({
        full_name: data.full_name ?? null,
        public_portfolio_enabled: data.public_portfolio_enabled === true,
        recruiter_share_contact: data.recruiter_share_contact === true,
      });
      setNotice(null);
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof ApiError && err.status === 404
          ? 'Complete your profile first, then come back to manage privacy.'
          : 'Could not load your privacy settings. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(change: Partial<Pick<PrivacyProfile, 'public_portfolio_enabled' | 'recruiter_share_contact'>>) {
    if (!profile || saving) return;
    const name = (profile.full_name ?? '').trim();
    if (!name) {
      setNotice({ kind: 'error', text: 'Add your full name to your profile before changing privacy settings.' });
      return;
    }
    const next = { ...profile, ...change };
    setSaving(true);
    setNotice(null);
    try {
      const response = await apiFetch('/api/profile/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name,
          public_portfolio_enabled: next.public_portfolio_enabled,
          recruiter_share_contact: next.recruiter_share_contact,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; warnings?: Array<{ message?: string }> }
        | null;
      if (!response.ok) {
        setNotice({ kind: 'error', text: body?.error ?? 'Could not save your settings.' });
        return;
      }
      if (body?.warnings && body.warnings.length > 0) {
        // The visibility columns are not available yet: nothing was changed, so do not pretend it was.
        setNotice({
          kind: 'warning',
          text: 'Privacy settings are not available yet on this deployment. Your choices were not saved, so nothing is shared.',
        });
        return;
      }
      setProfile(next);
      setNotice({ kind: 'success', text: 'Saved.' });
    } catch {
      setNotice({ kind: 'error', text: 'Could not save your settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Privacy &amp; sharing</h1>
      <p className="mt-2 text-sm text-gray-600">
        You decide who sees what. Everything is off until you turn it on, and you can change it at any time.
      </p>

      <div role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
        {notice && (
          <p
            className={
              notice.kind === 'success'
                ? 'text-green-700'
                : notice.kind === 'warning'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }
          >
            {notice.text}
          </p>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-gray-600">Loading…</p>
      ) : profile ? (
        <div className="mt-4 space-y-6">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <input
              id={portfolioId}
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={profile.public_portfolio_enabled}
              disabled={saving}
              onChange={(e) => void update({ public_portfolio_enabled: e.target.checked })}
            />
            <label htmlFor={portfolioId} className="text-sm">
              <span className="block font-medium">Public portfolio</span>
              <span className="text-gray-600">
                Anyone with your portfolio link can see your verified certificates (title, institution and date).
                Files, descriptions and OCR text are never shown.
              </span>
            </label>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <input
              id={contactId}
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={profile.recruiter_share_contact}
              disabled={saving}
              onChange={(e) => void update({ recruiter_share_contact: e.target.checked })}
            />
            <label htmlFor={contactId} className="text-sm">
              <span className="block font-medium">Share contact details with approved recruiters</span>
              <span className="text-gray-600">
                Approved recruiters of your organisation can see your email, phone, GPA and profile links.
                Without this they only see your verified certificates and basic profile information.
              </span>
            </label>
          </div>
        </div>
      ) : null}

      <p className="mt-8 text-sm">
        <Link href="/student/dashboard" className="text-blue-700 underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
