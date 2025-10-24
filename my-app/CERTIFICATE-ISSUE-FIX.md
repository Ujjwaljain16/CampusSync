# Certificate Issue API Fix - Complete Solution

## Problem Summary
The `/api/certificates/issue` endpoint was returning a 500 error with an unhelpful error message:
```
[withAuth] Error: Response { status: 500, ... }
```

## Root Causes Identified

### 1. **Redundant Role Fetching**
The route was calling `getServerUserWithRole()` even though it was already wrapped in `withAuth` middleware that provides the user object.

### 2. **Poor Error Handling**
- The `withAuth` middleware was catching errors but not properly logging the actual error details
- Response objects were being logged instead of error messages
- No try-catch block in the main handler logic

### 3. **Cascading Failures**
When `getServerUserWithRole()` had issues or the role fetch failed, it would throw an error that wasn't properly caught or logged.

## Solutions Implemented

### 1. **Updated `/api/certificates/issue/route.ts`**

#### Before:
```typescript
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  const { role } = await getServerUserWithRole(); // PROBLEM: Redundant call
  
  // ... rest of code without error handling
  
  return success(vc, 'Verifiable credential issued successfully', 201);
});
```

#### After:
```typescript
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get user role safely - inline query instead of function call
    let role = 'student';
    try {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (roleData) {
        role = roleData.role;
      }
    } catch (roleError) {
      console.error('Error fetching user role, defaulting to student:', roleError);
    }
    
    // ... rest of the logic ...
    
    return success(vc, 'Verifiable credential issued successfully', 201);
  } catch (error) {
    console.error('[Issue VC] Error:', error);
    
    // If it's already an API error Response, return it
    if (error instanceof Response) {
      return error;
    }
    
    // Otherwise, return a generic error with details
    return apiError.internal(
      error instanceof Error ? error.message : 'Failed to issue verifiable credential'
    );
  }
});
```

**Key Changes:**
- ✅ Removed redundant `getServerUserWithRole()` call
- ✅ Added inline role fetching with fallback to 'student'
- ✅ Wrapped entire handler in try-catch block
- ✅ Added proper error logging with context
- ✅ Handle both Response objects and Error objects properly
- ✅ Removed unused import

### 2. **Enhanced `withAuth` Middleware** (`src/lib/api/middleware/auth.ts`)

#### Before:
```typescript
export function withAuth(handler: ApiHandler) {
  return async (request: NextRequest) => {
    try {
      const supabase = await createSupabaseServerClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return apiError.unauthorized('Authentication required')
      }
      
      return await handler(request, { user })
    } catch (err) {
      console.error('[withAuth] Error:', err) // Logged Response objects
      return apiError.internal('Authentication error')
    }
  }
}
```

#### After:
```typescript
export function withAuth(handler: ApiHandler) {
  return async (request: NextRequest) => {
    try {
      const supabase = await createSupabaseServerClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return apiError.unauthorized('Authentication required')
      }
      
      const result = await handler(request, { user })
      
      // Verify handler returned a Response
      if (result instanceof Response) {
        return result
      }
      
      console.error('[withAuth] Handler did not return a Response:', result)
      return apiError.internal('Invalid response from handler')
    } catch (err) {
      console.error('[withAuth] Error:', err)
      
      // If error is already a Response (from apiError), return it
      if (err instanceof Response) {
        return err
      }
      
      // Log actual error message
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[withAuth] Error message:', errorMessage)
      
      return apiError.internal('Authentication error: ' + errorMessage)
    }
  }
}
```

**Key Changes:**
- ✅ Added validation that handler returns a Response
- ✅ Check if caught error is already a Response object
- ✅ Extract and log actual error messages
- ✅ Include error message in response for better debugging

### 3. **Fixed Audit Log** (Already done previously)
- Removed redundant `getServerUserWithRole()` call in audit log section
- Use `user.id` directly from the `withAuth` context

## Benefits of These Changes

1. **Better Error Visibility**: Actual error messages are now logged and returned
2. **Reduced Redundancy**: No duplicate database calls for user role
3. **Graceful Degradation**: Role fetching failures don't crash the entire request
4. **Proper Error Flow**: Response objects are properly returned through the middleware chain
5. **Improved Debugging**: Detailed console logs help identify issues quickly

## Testing Checklist

After these changes, test the following scenarios:

- [ ] **Successful VC Issuance**: Approve and issue a certificate - should return 201 with VC data
- [ ] **Permission Checks**: Try to issue VC for another user without permission - should return 403
- [ ] **Invalid Input**: Send malformed JSON - should return 400 with clear error
- [ ] **Missing Certificate**: Try to issue for non-existent certificateId - should return 404
- [ ] **Role Fallback**: Works even if role fetch fails (defaults to 'student')
- [ ] **Error Logging**: Check console for detailed error messages on failures

## Environment Variables Required

Make sure these are set in `.env.local`:
```bash
VC_ISSUER_JWK={"key_ops":["sign"],...}  # Single line JSON
NEXT_PUBLIC_ISSUER_DID=did:web:localhost:3000
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:localhost:3000#key-ce8eddb4
```

## Additional Notes

- The `getServerUserWithRole()` function is still used in many other routes (recruiter, admin, etc.) but those don't use `withAuth` middleware, so they're fine
- Consider creating a `withAuthAndRole` middleware that combines authentication and role fetching in one step
- The audit log silently fails if it can't insert - consider adding a fallback queue or retry mechanism

## Files Modified

1. `src/app/api/certificates/issue/route.ts` - Main handler improvements
2. `src/lib/api/middleware/auth.ts` - Enhanced error handling
3. `.env.local` - Fixed JWK formatting (already done)

## Commit Message Suggestion

```
fix(api): Improve error handling in certificate issuance endpoint

- Remove redundant getServerUserWithRole() call in issue route
- Add comprehensive try-catch block with detailed error logging
- Enhance withAuth middleware to properly handle Response objects
- Add fallback for role fetching with default to 'student'
- Improve error message visibility in console and responses

Fixes #[issue-number] - Certificate issue endpoint 500 errors
```
