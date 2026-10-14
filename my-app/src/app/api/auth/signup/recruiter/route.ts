import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { findAuthUserByEmail } from '@/lib/auth/findUserByEmail';

/**
 * POST /api/auth/signup/recruiter
 * 
 * Signup endpoint for recruiters (no organization email required).
 * 
 * Flow:
 * 1. Creates auth user with any email
 * 2. Assigns 'recruiter' role with NO organization_id (NULL)
 * 3. Creates profile with company info
 * 4. Sends verification email
 * 5. Recruiter can later request access to organizations
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'signup', { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 10 });
  if (limited) return limited;

  try {
    const body = await request.json();
    const { email, password, full_name, company_name, phone } = body;

    // Validation
    if (!email || !password || !full_name || !company_name) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, full_name, company_name' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const adminClient = await createSupabaseAdminClient();

    // Check if user already exists
    const existingUser = await findAuthUserByEmail(adminClient, email);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // SECURITY: an existing account may only be completed/modified by its own
      // authenticated session. Without this, anyone could set the password of (or
      // add roles to) another person's account just by knowing their email.
      const sessionClient = await createSupabaseServerClient();
      const { data: { user: sessionUser } } = await sessionClient.auth.getUser();
      if (!sessionUser || sessionUser.id !== existingUser.id) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in to continue.', shouldSignIn: true },
          { status: 409 }
        );
      }
      userId = existingUser.id;
      const isOAuthUser = existingUser.app_metadata?.provider && existingUser.app_metadata.provider !== 'email';
      
      // Check ALL roles for this user (both with and without organization_id)
      const { data: existingRoles } = await adminClient
        .from('user_roles')
        .select('id, role, organization_id, approval_status')
        .eq('user_id', userId);

      // Check if user already has a recruiter role
      const recruiterRole = existingRoles?.find(r => r.role === 'recruiter' && r.organization_id === null);
      
      if (recruiterRole) {
        // User already has recruiter account
        return NextResponse.json({
          success: true,
          userId,
          message: 'Account already exists. Please sign in or check your email for verification.',
          shouldSignIn: true
        }, { status: 200 });
      }

      // Check if user has ANY other role (student, faculty, admin, etc.)
      const otherRoles = existingRoles?.filter(r => r.role !== 'recruiter');
      
      if (otherRoles && otherRoles.length > 0) {
        // User already registered with different role - REJECT with user-friendly message
        const roleNames = otherRoles.map(r => {
          if (r.role === 'student') return 'Student';
          if (r.role === 'faculty') return 'Faculty';
          if (r.role === 'admin') return 'Admin';
          return r.role;
        }).join(' and ');
        
        return NextResponse.json({
          error: `This email is already registered as ${roleNames}.\n\nPlease sign in with your existing account or use a different email address.`,
        }, { status: 409 }); // 409 Conflict
      }

      // IMPORTANT: For OAuth users completing signup, set the password they entered
      // This allows them to login with email/password in addition to OAuth
      if (isOAuthUser && password) {
        try {
          const { error: passwordError } = await adminClient.auth.admin.updateUserById(
            userId,
            { password }
          );
          
          if (passwordError) {
            console.error('[RECRUITER_SIGNUP] Failed to set password for OAuth user:', passwordError.message);
            // Don't fail the signup - they can still use OAuth
          }
        } catch (err) {
          console.error('[RECRUITER_SIGNUP] Error setting password:', err);
          // Don't fail the signup - they can still use OAuth
        }
      }

      // User exists but has no roles at all - this shouldn't happen but we'll allow it
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Require email verification
        user_metadata: {
          full_name,
          company_name,
          phone,
          signup_type: 'recruiter'
        }
      });

      if (authError) {
        console.error('[RECRUITER_SIGNUP] Auth user creation failed:', authError.message);
        return NextResponse.json(
          { error: authError.message || 'Failed to create account' },
          { status: 400 }
        );
      }

      if (!authData.user) {
        return NextResponse.json(
          { error: 'User creation returned no data' },
          { status: 500 }
        );
      }

      userId = authData.user.id;
      isNewUser = true;

      // IMPORTANT: When using admin.createUser() with email_confirm: false,
      // Supabase creates the user but does NOT automatically send confirmation email.
      // We need to trigger it manually using the regular (non-admin) client.
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const regularClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Trigger the confirmation email
        const { error: resendError } = await regularClient.auth.resend({
          type: 'signup',
          email: email,
        });

        if (resendError) {
          console.error('[RECRUITER_SIGNUP] Failed to send confirmation email for user', userId, resendError.message);
        }
      } catch (emailError) {
        console.error('[RECRUITER_SIGNUP] Error sending confirmation email for user', userId, emailError instanceof Error ? emailError.message : 'unknown');
      }
    }

    // For new users only, create role and profile
    if (isNewUser) {
      // Create new recruiter role with NULL organization_id and pending approval
      const { error: roleError } = await adminClient
        .from('user_roles')
        .insert({
          user_id: userId,
          organization_id: null, // Recruiters have no default org
          role: 'recruiter',
          approval_status: 'pending', // Requires approval to access organizations
          assigned_by: null
        });

      if (roleError) {
        console.error('[RECRUITER_SIGNUP] Role assignment failed:', roleError.code, roleError.message);
        // Rollback: delete auth user
        await adminClient.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: 'Failed to assign role' },
          { status: 500 }
        );
      }

      // Create the profile ONLY for new users (never overwrite an existing user's profile).
      // upsert, not insert: the auth.users signup trigger may already have created the row.
      // No role column on profiles: the recruiter role lives in user_roles.
      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          id: userId,
          email,
          full_name,
          company_name: String(company_name).trim(),
          phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
          organization_id: null // No default org
        }, { onConflict: 'id' });

      if (profileError) {
        console.error('[RECRUITER_SIGNUP] Profile creation failed:', profileError.message);
        // Don't rollback - profile creation is not critical
      }
    }

    const successMessage = isNewUser 
      ? 'Recruiter account created! Please check your email to verify your account.'
      : 'Account setup completed! Signing you in...';

    return NextResponse.json({
      success: true,
      userId,
      role: 'recruiter',
      email,
      isNewUser,
      message: successMessage,
      shouldSignIn: !isNewUser, // OAuth users (existing) can sign in, new users need to verify email
      requiresEmailVerification: isNewUser // Only new email/password users need verification
    }, { status: isNewUser ? 201 : 200 });

  } catch (error: unknown) {
    console.error('[RECRUITER_SIGNUP] Error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
