import { z } from 'zod';

// Server-side environment validator and accessor.
// IMPORTANT: Do NOT import this module from client-side code.

const ServerEnv = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VC_ISSUER_JWK: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});

type ServerEnvType = z.infer<typeof ServerEnv>;

let parsed: ServerEnvType | null = null;

export function getServerEnv() {
  if (parsed) return parsed;

  // Validate process.env at runtime and throw helpful errors early.
  parsed = ServerEnv.parse(process.env as Record<string, unknown>);

  // Parse and validate JWK JSON structure lightly — keep it as string for security reasons,
  // modules that need the parsed JWK should parse it locally. We still ensure it exists.

  return parsed;
}

export function getIssuerJwkJson(): string {
  const env = getServerEnv();
  return env.VC_ISSUER_JWK;
}
