/**
 * @deprecated This file is deprecated. Use @/lib/supabase/client instead.
 * This file is kept for backwards compatibility and re-exports from the new location.
 */

// Re-export everything from the new location
export { createClient, supabase } from '../src/lib/supabase/client';

// Alias for backwards compatibility
export { createClient as getSupabaseBrowserClient } from '../src/lib/supabase/client';
