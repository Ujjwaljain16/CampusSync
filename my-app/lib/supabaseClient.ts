import { createBrowserClient } from '@supabase/ssr'

// Check if environment variables are available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    cookies: {
      get(name: string) {
        if (typeof document !== 'undefined') {
          const value = document.cookie
            .split('; ')
            .find(row => row.startsWith(`${name}=`))
            ?.split('=')[1];
          return value;
        }
        return undefined;
      },
      set(name: string, value: string, options: any) {
        if (typeof document !== 'undefined') {
          document.cookie = `${name}=${value}; ${Object.entries(options || {})
            .map(([key, val]) => `${key}=${val}`)
            .join('; ')}`;
        }
      },
      remove(name: string, options: any) {
        if (typeof document !== 'undefined') {
          document.cookie = `${name}=; ${Object.entries({ ...options, maxAge: 0 })
            .map(([key, val]) => `${key}=${val}`)
            .join('; ')}`;
        }
      }
    }
  }
)
