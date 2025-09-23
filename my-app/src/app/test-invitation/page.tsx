'use client';

import { useState, useEffect } from 'react';

export default function TestInvitationPage() {
  const [email, setEmail] = useState('student1@university.edu');
  const [invitationData, setInvitationData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkInvitation = async () => {
    if (!email.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/test-invitation?email=${encodeURIComponent(email)}`);
      const data = await response.json();
      setInvitationData(data);
    } catch (error) {
      console.error('Error checking invitation:', error);
      setInvitationData({ error: 'Failed to check invitation' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (email) {
      checkInvitation();
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-4xl mx-auto px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
          <h1 className="text-3xl font-bold text-white mb-6">Test Invitation System</h1>
          
          <div className="mb-6">
            <label className="block text-white/80 text-sm font-medium mb-2">
              Email Address
            </label>
            <div className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student1@university.edu"
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
              <button
                onClick={checkInvitation}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'Check Invitation'}
              </button>
            </div>
          </div>

          {invitationData && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              {invitationData.error ? (
                <div className="text-red-300">
                  <h3 className="text-lg font-semibold mb-2">Error</h3>
                  <p>{invitationData.error}</p>
                </div>
              ) : (
                <div className="text-white">
                  <h3 className="text-lg font-semibold mb-4">Invitation Details</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-white/60 text-sm">Email</p>
                      <p className="font-medium">{invitationData.email}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-sm">Invited Role</p>
                      <p className="font-medium capitalize">{invitationData.invited_role}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-sm">User ID</p>
                      <p className="font-mono text-sm">{invitationData.user_id}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-sm">Created At</p>
                      <p className="text-sm">{new Date(invitationData.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-blue-300 mb-2">How to Test:</h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Go to <a href="/login" className="text-blue-300 hover:underline">Login Page</a></li>
                      <li>Click "Sign Up" tab</li>
                      <li>Enter the email: <code className="bg-white/10 px-2 py-1 rounded">{invitationData.email}</code></li>
                      <li>Enter any password</li>
                      <li>Click "Sign Up"</li>
                      <li>You'll be automatically assigned the <strong>{invitationData.invited_role}</strong> role!</li>
                    </ol>
                  </div>

                  {invitationData.test_signup_url && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                      <h4 className="font-semibold text-green-300 mb-2">Direct Test Link:</h4>
                      <a 
                        href={invitationData.test_signup_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-300 hover:underline break-all"
                      >
                        {invitationData.test_signup_url}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

