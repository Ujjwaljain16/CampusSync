# 🔄 Password Reset Flow Diagram

## Complete PKCE Flow (What Happens Now - CORRECT ✅)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PASSWORD RESET FLOW                          │
│                           (PKCE Method)                             │
└─────────────────────────────────────────────────────────────────────┘

Step 1: User Requests Reset
━━━━━━━━━━━━━━━━━━━━━━━━━━
   User                    Frontend                  Supabase
    │                         │                         │
    │─── Clicks "Forgot" ────>│                         │
    │    Password             │                         │
    │                         │                         │
    │                         │── resetPasswordFor ────>│
    │                         │    Email(email)         │
    │                         │                         │
    │                         │<── Success ─────────────│
    │<── "Email sent" ────────│                         │
    │                         │                         │


Step 2: Supabase Sends Email
━━━━━━━━━━━━━━━━━━━━━━━━━━
                            Supabase
                               │
                               │ 1. Generate token_hash
                               │ 2. Create PKCE code
                               │ 3. Store in database
                               │
                               │── Send Email ──────────>  📧
                               │                           │
                Email Template:                           │
                {{ .SiteURL }}/reset-password?            │
                token_hash={{ .TokenHash }}&              │
                type=recovery                             │
                                                           │
                                                User Inbox


Step 3: User Clicks Email Link
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   User                    Browser                 Next.js Server
    │                         │                         │
    │── Clicks link ─────────>│                         │
    │                         │                         │
    │   URL: /reset-password? │                         │
    │   token_hash=ABC123&    │                         │
    │   type=recovery         │                         │
    │                         │                         │
    │                         │── GET Request ─────────>│
    │                         │    (with token_hash)    │
    │                         │                         │


Step 4: Middleware Intercepts (CRITICAL!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        Next.js Middleware
                               │
                               │ Detects: /reset-password route
                               │ Sees: ?token_hash=ABC123
                               │
                    ┌──────────┴──────────┐
                    │  updateSession()    │
                    │  from middleware.ts │
                    └──────────┬──────────┘
                               │
                               │ Creates Supabase
                               │ server client with:
                               │ - detectSessionInUrl: true
                               │ - flowType: 'pkce'
                               │
                               │
          ┌────────────────────┴────────────────────┐
          │   supabase.auth.getUser()               │
          │   (automatically exchanges token_hash)  │
          └────────────────────┬────────────────────┘
                               │
                    Supabase Auth Server
                               │
                               │ 1. Validate token_hash
                               │ 2. Verify PKCE code
                               │ 3. Generate access_token
                               │ 4. Generate refresh_token
                               │ 5. Set secure cookies
                               │
                               │
                    ┌──────────┴──────────┐
                    │ Session Established │
                    │ Cookies Set         │
                    └──────────┬──────────┘
                               │
                               │ Return to middleware
                               │ { user, supabase, ... }
                               │
                    ┌──────────┴──────────┐
                    │ Middleware allows   │
                    │ access (isPublic)   │
                    └──────────┬──────────┘
                               │
                               │ Serve page with
                               │ session cookies
                               ▼


Step 5: Reset Password Page Loads
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  reset-password/page.tsx
                               │
                    ┌──────────┴──────────┐
                    │    useEffect()      │
                    │    runs on mount    │
                    └──────────┬──────────┘
                               │
                               │ createClient()
                               │
                    ┌──────────┴──────────┐
                    │ getSession()        │
                    └──────────┬──────────┘
                               │
                               │ Check for existing
                               │ session in cookies
                               │
                    ┌──────────┴──────────┐
                    │ ✅ Session Found!   │
                    │ (from middleware)   │
                    └──────────┬──────────┘
                               │
                               │ setIsValidating(false)
                               │ Show reset form
                               ▼


Step 6: User Submits New Password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   User                    Frontend                  Supabase
    │                         │                         │
    │─── Enters password ────>│                         │
    │    Clicks submit        │                         │
    │                         │                         │
    │                         │ 1. Validate password    │
    │                         │ 2. Check session        │
    │                         │                         │
    │                         │── updateUser({ ────────>│
    │                         │    password: "new" })   │
    │                         │                         │
    │                         │                         │ Update password
    │                         │                         │ in database
    │                         │                         │
    │                         │<── Success ─────────────│
    │                         │                         │
    │                         │ signOut()               │
    │                         │                         │
    │<── Success! ────────────│                         │
    │    "Redirecting..."     │                         │
    │                         │                         │
    │                         │ Wait 2 seconds          │
    │                         │                         │
    │                         │ router.push('/login')   │
    │                         │                         │
    │── Redirected to ───────>│                         │
       /login page


Step 7: User Logs In with New Password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   User                    Frontend                  Supabase
    │                         │                         │
    │─── Enters email ───────>│                         │
    │    & NEW password       │                         │
    │    Clicks login         │                         │
    │                         │                         │
    │                         │── signInWith ──────────>│
    │                         │    Password()           │
    │                         │                         │
    │                         │                         │ Verify new
    │                         │                         │ password
    │                         │                         │
    │                         │<── Success ─────────────│
    │                         │    (session tokens)     │
    │                         │                         │
    │<── Logged in! ──────────│                         │
    │    Go to dashboard      │                         │
    │                         │                         │


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            ✅ SUCCESS!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ❌ OLD Flow (What Was Happening - WRONG)

```
Step 3 (OLD - WRONG):
━━━━━━━━━━━━━━━━━━━━━
   User                    Browser
    │                         │
    │── Clicks link ─────────>│
    │                         │
    │   URL: /reset-password# │  ← HASH FRAGMENT!
    │   access_token=ABC123&  │  ← Token in URL!
    │   type=recovery         │  ← Client-side only!
    │                         │
    │                         │ Browser loads page
    │                         │ but hash (#) part never
    │                         │ sent to server!
    │                         │
    │                         ▼
                         ❌ Server doesn't see token
                         ❌ Middleware can't create session
                         ❌ Page loads with NO session
                         ❌ "Auth session missing!" error
```

---

## Key Differences Explained

### PKCE Flow (Correct ✅)

| Aspect | Details |
|--------|---------|
| **URL Type** | Query parameters: `?token_hash=...` |
| **Server Visibility** | ✅ Server sees token_hash |
| **Token Exchange** | Server-side (secure) |
| **Session Creation** | Automatic in middleware |
| **Security** | High - tokens never exposed |
| **Flow** | Server exchanges token for session |

### Implicit Flow (Wrong ❌)

| Aspect | Details |
|--------|---------|
| **URL Type** | Hash fragment: `#access_token=...` |
| **Server Visibility** | ❌ Server doesn't see hash |
| **Token Exchange** | Client-side (less secure) |
| **Session Creation** | Manual in browser |
| **Security** | Lower - tokens in URL |
| **Flow** | Client must manually set session |

---

## Security Comparison

```
PKCE Flow Security:
┌─────────────────────────────────────────────────────┐
│  1. Token Hash in query params                      │
│     ✅ Sent to server                               │
│     ✅ Not logged in browser history (by design)    │
│                                                      │
│  2. Server-side exchange                            │
│     ✅ Token never touches client                   │
│     ✅ Access token in HTTP-only cookies            │
│                                                      │
│  3. PKCE code verifier                              │
│     ✅ Prevents token interception                  │
│     ✅ One-time use                                 │
│                                                      │
│  4. Short-lived tokens                              │
│     ✅ 1 hour expiry                                │
│     ✅ Automatic refresh                            │
└─────────────────────────────────────────────────────┘

Implicit Flow Issues:
┌─────────────────────────────────────────────────────┐
│  1. Access token in URL hash                        │
│     ❌ Visible in browser                           │
│     ❌ May be logged                                │
│                                                      │
│  2. Client-side handling                            │
│     ❌ Token accessible to JavaScript               │
│     ❌ XSS vulnerability                            │
│                                                      │
│  3. No code verifier                                │
│     ❌ Token can be intercepted                     │
│     ❌ Replay attacks possible                      │
│                                                      │
│  4. Deprecated                                      │
│     ❌ OAuth 2.1 removes implicit flow              │
│     ❌ Not recommended by IETF                      │
└─────────────────────────────────────────────────────┘
```

---

## Timeline Comparison

### Before Fix (Error Flow) ⏱️ ~5 seconds total

```
0.0s: User clicks email link
0.1s: Browser navigates to /reset-password#access_token=...
0.2s: Server receives request (no token - it's in hash!)
0.3s: Middleware runs, no session found
0.4s: Page renders with no session
0.5s: useEffect runs, tries to set session from hash
1.0s: setSession() called with tokens from hash
1.5s: ❌ ERROR: "Auth session missing!"
      (Session not properly established)
```

### After Fix (Success Flow) ⏱️ ~2 seconds total

```
0.0s: User clicks email link
0.1s: Browser navigates to /reset-password?token_hash=...
0.2s: Server receives request with token_hash
0.3s: Middleware runs, detects token_hash
0.5s: Middleware exchanges token → creates session
0.7s: Session cookies set
0.8s: Page renders with valid session
0.9s: useEffect runs, detects existing session
1.0s: ✅ SUCCESS: Form appears, ready to reset password
```

---

## Cookie Flow

```
PKCE Flow - Cookies Set by Server:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After token exchange in middleware:

Set-Cookie: sb-<project>-auth-token=<token>; 
            Path=/; 
            HttpOnly; 
            Secure; 
            SameSite=Lax;
            Max-Age=3600

Set-Cookie: sb-<project>-auth-token-code-verifier=<code>; 
            Path=/; 
            HttpOnly; 
            Secure; 
            SameSite=Lax;
            Max-Age=3600

These cookies:
✅ Automatically sent with every request
✅ Not accessible to JavaScript (HttpOnly)
✅ Protected from CSRF (SameSite)
✅ Only sent over HTTPS in production (Secure)
```

---

## Debugging Tips

### Check if PKCE is Working:

**1. Look at the email link:**
```bash
# ✅ CORRECT (PKCE):
http://localhost:3000/reset-password?token_hash=abc123&type=recovery

# ❌ WRONG (Implicit):
http://localhost:3000/reset-password#access_token=abc123&type=recovery
```

**2. Check browser DevTools → Network:**
```
Request URL: /reset-password?token_hash=abc123&type=recovery
Request Headers:
  Cookie: (none on first request)

Response Headers:
  Set-Cookie: sb-xxx-auth-token=... ← Should be present!
  Set-Cookie: sb-xxx-auth-token-code-verifier=... ← Should be present!
```

**3. Check browser DevTools → Application → Cookies:**
```
After clicking link, you should see:
✅ sb-<project>-auth-token
✅ sb-<project>-auth-token-code-verifier

If no cookies → Token exchange failed!
```

**4. Check browser Console:**
```javascript
// ✅ SUCCESS logs:
🔍 [Reset Password] Initializing password reset flow...
✅ [Reset Password] Valid session found via PKCE flow

// ❌ ERROR logs:
🔍 [Reset Password] Initializing password reset flow...
❌ [Reset Password] No valid session found
```

---

This diagram shows the complete flow and why PKCE is superior! 🚀
