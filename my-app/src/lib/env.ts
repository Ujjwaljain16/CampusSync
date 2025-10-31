// Public environment accessor — safe to import from client and server.
// Exports only NEXT_PUBLIC_* variables. Do NOT add server-only secrets here.
export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? '',
  NEXT_PUBLIC_ISSUER_DID: process.env.NEXT_PUBLIC_ISSUER_DID ?? '',
  NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD: process.env.NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD ?? '',
};

// Small runtime check for development to warn about missing public envs
if (typeof window === 'undefined') {
  // server-side: only warn when running in development
  if (process.env.NODE_ENV !== 'production') {
    if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      // keep message concise — avoid printing secrets
      console.warn('[env] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
    }
  }
}
  
export type PublicEnv = typeof publicEnv;
