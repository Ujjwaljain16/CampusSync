'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function DebugSignupPage() {
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('password123');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      console.log('Starting signup...');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      console.log('Signup result:', { data, error });
      setResult({ data, error });
      
      if (data.user) {
        console.log('User created:', data.user);
        
        // Check session immediately
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('Session after signup:', { session, sessionError });
        
        // Check user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        console.log('User after signup:', { user, userError });
      }
      
    } catch (error) {
      console.error('Signup error:', error);
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Debug Signup</h1>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        
        <button
          onClick={handleSignup}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </div>
      
      {result && (
        <div className="bg-gray-100 p-4 rounded">
          <h3 className="font-semibold mb-2">Result:</h3>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}



