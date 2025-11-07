// Server-side environment validator and accessor.
// IMPORTANT: Do NOT import this module from client-side code.

// NOTE: Zod validation removed - using manual validation for zero dependencies
// If you need runtime validation, install zod: npm install zod

interface ServerEnvType {
  SUPABASE_SERVICE_ROLE_KEY: string;
  VC_ISSUER_JWK: string;
  NODE_ENV?: 'development' | 'production' | 'test';
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

function validateServerEnv(env: NodeJS.ProcessEnv): ServerEnvType {
  const missing: string[] = [];
  
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.VC_ISSUER_JWK) missing.push('VC_ISSUER_JWK');
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required server environment variables: ${missing.join(', ')}\n` +
      'Please check your .env.local file.'
    );
  }
  
  return {
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
    VC_ISSUER_JWK: env.VC_ISSUER_JWK!,
    NODE_ENV: env.NODE_ENV as ServerEnvType['NODE_ENV'],
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

let parsed: ServerEnvType | null = null;

export function getServerEnv(): ServerEnvType {
  if (parsed) return parsed;

  // Validate process.env at runtime and throw helpful errors early.
  parsed = validateServerEnv(process.env);

  // Parse and validate JWK JSON structure lightly — keep it as string for security reasons,
  // modules that need the parsed JWK should parse it locally. We still ensure it exists.
  try {
    JSON.parse(parsed.VC_ISSUER_JWK);
  } catch {
    throw new Error('VC_ISSUER_JWK is not valid JSON. Please check your environment configuration.');
  }

  return parsed;
}

export function getIssuerJwkJson(): string {
  const env = getServerEnv();
  return env.VC_ISSUER_JWK;
}
