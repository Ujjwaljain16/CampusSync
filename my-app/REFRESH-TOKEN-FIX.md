# Refresh Token Fix for Next.js 15 + Supabase

## Problem
`AuthApiError: Invalid Refresh Token: Refresh Token Not Found`

This error occurs in Next.js 15 with Supabase due to improper cookie handling in the App Router, especially with the new `@supabase/ssr` package.

## Root Cause
- Next.js 15 changed how cookies are handled in middleware and server components
- The old `@supabase/supabase-js` client doesn't properly manage refresh tokens with Next.js 15's cookie system
- Middleware wasn't properly refreshing sessions before route handlers executed

## Solution Implemented

### 1. Updated Supabase Client Creation

#### Browser Client (`lib/supabaseClient.ts`)
- Changed from `createClient` to `createBrowserClient` from `@supabase/ssr`
- Implements singleton pattern to prevent multiple client instances
- Properly handles browser-side session management

#### Server Client (`src/lib/supabase/server.ts`)
- New utility using `createServerClient` with proper async cookie handling
- Handles read-only cookie contexts gracefully
- Uses Next.js 15's async `cookies()` API

#### Middleware Helper (`src/lib/supabase/middleware.ts`)
- Dedicated utility for session refresh in middleware
- Properly syncs cookies between request and response
- Prevents session termination issues

### 2. Updated Middleware (`src/middleware.ts`)
- Now uses the `updateSession` helper
- Properly refreshes tokens before checking authentication
- Returns the modified response with updated cookies
- Prevents the "refresh token not found" error

### 3. Updated Auth Callback (`src/app/api/auth/callback/route.ts`)
- Fixed cookie handling during OAuth flows
- Uses `NextResponse.redirect()` instead of manual headers
- Properly propagates session cookies

## Testing the Fix

### 1. Clear Browser Data
```bash
# In browser DevTools Console:
localStorage.clear()
sessionStorage.clear()
# Then manually delete all cookies for your domain
```

### 2. Restart Development Server
```powershell
# Stop current server (Ctrl+C)
npm run dev
```

### 3. Test Authentication Flow
1. Navigate to `/login`
2. Sign in with your credentials
3. Check browser console - should see no auth errors
4. Navigate to protected routes (e.g., `/faculty/dashboard`)
5. Refresh the page multiple times - session should persist
6. Wait 5 minutes and refresh - token should auto-refresh

### 4. Verify Token Refresh
```javascript
// In browser console while logged in:
const { data } = await supabase.auth.getSession()
console.log('Session expires at:', new Date(data.session?.expires_at * 1000))

// Wait a minute, then check again - it should auto-refresh if needed
```

## Key Changes Summary

| File | Change |
|------|--------|
| `lib/supabaseClient.ts` | Use `createBrowserClient` instead of `createClient` |
| `src/lib/supabase/client.ts` | New browser client utility |
| `src/lib/supabase/server.ts` | New server client utility with async cookies |
| `src/lib/supabase/middleware.ts` | New session refresh utility |
| `src/middleware.ts` | Use `updateSession` helper for proper token refresh |
| `src/app/api/auth/callback/route.ts` | Fix cookie propagation in OAuth callback |

## Additional Recommendations

### 1. Environment Variables
Ensure these are set in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Supabase Dashboard Settings
- **Auth > URL Configuration**: Add your localhost URL (http://localhost:3000)
- **Auth > Redirect URLs**: Add allowed redirect URLs
- **Auth > Email Templates**: Verify redirect URLs in templates

### 3. Cookie Settings (Production)
When deploying, ensure:
```typescript
// In your Supabase config
{
  auth: {
    flowType: 'pkce', // More secure
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}
```

### 4. Session Duration
In Supabase Dashboard > Auth > Settings:
- JWT expiry: 3600s (1 hour) - default
- Refresh token expiry: 2592000s (30 days) - default

## Troubleshooting

### Still Getting Refresh Token Errors?

1. **Clear all cookies and storage**
   ```javascript
   // Browser console
   localStorage.clear();
   sessionStorage.clear();
   document.cookie.split(";").forEach(c => {
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
   });
   ```

2. **Check middleware execution**
   ```typescript
   // Add debug logging in middleware
   console.log('Middleware executing for:', req.nextUrl.pathname);
   console.log('User:', user?.email);
   ```

3. **Verify Supabase packages**
   ```powershell
   npm ls @supabase/ssr @supabase/supabase-js
   ```
   Should show:
   - `@supabase/ssr@0.5.0` or higher
   - `@supabase/supabase-js@2.57.4` or higher

4. **Check for multiple Supabase clients**
   Search for old patterns:
   ```powershell
   grep -r "createClient.*@supabase/supabase-js" src/
   ```
   Replace with proper client utilities.

5. **Restart both dev server and browser**
   - Stop dev server
   - Close all browser windows
   - Clear browser cache
   - Start fresh

## Migration Guide for Existing Code

### Before (Old Pattern)
```typescript
// ❌ Don't do this
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key, {
  auth: { persistSession: true }
})
```

### After (New Pattern)

**Client Components:**
```typescript
// ✅ Do this
'use client'
import { createClient } from '@/lib/supabase/client'

export default function MyComponent() {
  const supabase = createClient()
  // ...
}
```

**Server Components:**
```typescript
// ✅ Do this
import { createClient } from '@/lib/supabase/server'

export default async function MyServerComponent() {
  const supabase = await createClient()
  // ...
}
```

**API Routes:**
```typescript
// ✅ Do this
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  // ...
}
```

## Expected Behavior After Fix

✅ **Correct:**
- No "Invalid Refresh Token" errors in console
- Session persists across page refreshes
- Automatic token refresh when approaching expiry
- Smooth navigation between protected routes
- OAuth flows work correctly

❌ **If you see these, the fix didn't work:**
- `AuthApiError: Invalid Refresh Token`
- Random logouts
- Session lost on page refresh
- Redirect loops between login and protected routes

## Support

If issues persist:
1. Check browser console for specific error messages
2. Check Next.js terminal output for server-side errors
3. Verify Supabase project settings
4. Check network tab for failed auth requests
5. Review Supabase logs in dashboard

## Version Compatibility
- Next.js: 15.5.3+
- React: 19.1.0+
- @supabase/ssr: 0.5.0+
- @supabase/supabase-js: 2.57.4+
