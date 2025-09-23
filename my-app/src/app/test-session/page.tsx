'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function TestSessionPage() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Get session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('Session check:', { session, sessionError });
        setSession(session);

        // Get user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        console.log('User check:', { user, userError });
        setUser(user);

        // Check cookies
        console.log('Cookies:', document.cookie);
        
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleSignup = async () => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: 'test@example.com',
        password: 'password123'
      });
      console.log('Signup result:', { data, error });
    } catch (error) {
      console.error('Signup error:', error);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Session Test</h1>
      
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Session:</h2>
        <pre className="bg-gray-100 p-2 rounded text-sm">
          {JSON.stringify(session, null, 2)}
        </pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">User:</h2>
        <pre className="bg-gray-100 p-2 rounded text-sm">
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Cookies:</h2>
        <pre className="bg-gray-100 p-2 rounded text-sm">
          {document.cookie}
        </pre>
      </div>

      <button 
        onClick={handleSignup}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Test Signup
      </button>
    </div>
  );
}



