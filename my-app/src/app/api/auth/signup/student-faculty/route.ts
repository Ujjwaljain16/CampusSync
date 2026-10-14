import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { enforceGlobalRateLimit } from '@/lib/rateLimitGlobal';
import { extractDomain, domainMatchesAllowedList } from '@/lib/emailValidation';
import { findAuthUserByEmail } from '@/lib/auth/findUserByEmail';

/**
 * POST /api/auth/signup/student-faculty
 * 
 * Signup endpoint for students and faculty with organization email domains.
 * 
 * Flow:
 * 1. Validates email domain matches organization
 * 2. Creates auth user
 * 3. Assigns 'student' role with organization_id
 * 4. Creates profile
 * 5. Sends verification email
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'signup', { interval: 15 * 60 * 1000, uniqueTokenPerInterval: 10 });
  if (limited) return limited;
  const globalLimited = await enforceGlobalRateLimit(request, 'signup', { limit: 10, windowSeconds: 15 * 60 });
  if (globalLimited) return globalLimited;

  try {
    const body = await request.json();
    const { 
      email, 
      password, 
      full_name, 
      role, // <-- Add role from request body
      organization_id,
      university,
      major,
      graduation_year,
      location,
      gpa
    } = body;

    // Validation
    if (!email || !password || !full_name || !organization_id) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, full_name, organization_id' },
        { status: 400 }
      );
    }

    if (!role || !['student', 'faculty'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid or missing role. Must be either "student" or "faculty"' },
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

    // Verify organization exists and is active
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .select('id, name, settings')
      .eq('id', organization_id)
      .eq('is_active', true)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found or inactive' },
        { status: 404 }
      );
    }

    // Verify email domain matches organization's allowed domains
    // (single shared implementation: exact domain or `*.domain` wildcard)
    const emailDomain = extractDomain(String(email));
    const settings = org.settings as { allowed_email_domains?: unknown } | null;

    if (!domainMatchesAllowedList(emailDomain, settings?.allowed_email_domains)) {
      return NextResponse.json(
        { error: 'Email domain not authorized for this organization' },
        { status: 403 }
      );
    }

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
      const isEmailConfirmed = existingUser.email_confirmed_at != null;
      
      // Check ALL roles for this user
      const { data: existingRoles } = await adminClient
        .from('user_roles')
        .select('id, role, organization_id, approval_status')
        .eq('user_id', userId);

      // Check if user already has the correct role for this org
      const roleForThisOrg = existingRoles?.find(r => 
        r.organization_id === organization_id && (r.role === 'student' || r.role === 'faculty')
      );

      if (roleForThisOrg) {
        // User already fully set up for this org - they can just log in
        return NextResponse.json({
          success: true,
          userId,
          message: 'Account already exists. You can now sign in.',
          shouldSignIn: true,
          isOAuthUser,
          isEmailConfirmed
        }, { status: 200 });
      }

      // Check if user is a recruiter (org_id = null)
      const recruiterRole = existingRoles?.find(r => r.role === 'recruiter' && r.organization_id === null);
      
      if (recruiterRole) {
        // User is registered as recruiter - REJECT with user-friendly message
        return NextResponse.json({
          error: `This email is already registered as a Recruiter.\n\nPlease sign in with your existing account or use a different email address.`,
        }, { status: 409 }); // 409 Conflict
      }

      // Check if user belongs to a DIFFERENT organization
      const otherOrgRoles = existingRoles?.filter(r => 
        r.organization_id !== null && r.organization_id !== organization_id
      );

      if (otherOrgRoles && otherOrgRoles.length > 0) {
        // User belongs to different organization
        // Allow multi-org - continue to role assignment below
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
            console.error('[STUDENT_FACULTY_SIGNUP] Failed to set password for OAuth user:', passwordError.message);
            // Don't fail the signup - they can still use OAuth
          }
        } catch (err) {
          console.error('[STUDENT_FACULTY_SIGNUP] Error setting password:', err);
          // Don't fail the signup - they can still use OAuth
        }
      }

      // User exists but needs role setup for THIS org - continue to role assignment below
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Require email verification
        user_metadata: {
          full_name,
          organization_id,
          signup_type: 'student_faculty'
        }
      });

      if (authError) {
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

        // Trigger the confirmation email by attempting to sign in
        // This will fail (user not confirmed) but will trigger the email resend
        const { error: resendError } = await regularClient.auth.resend({
          type: 'signup',
          email: email,
        });

        if (resendError) {
          console.error('[SIGNUP] Failed to send confirmation email for user', userId, resendError.message);
        }
      } catch (emailError) {
        console.error('[SIGNUP] Error sending confirmation email for user', userId, emailError instanceof Error ? emailError.message : 'unknown');
      }
    }

    // Check if a user_roles entry already exists for this org (e.g. created by a trigger)
    const { data: existingRole } = await adminClient
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId)
      .eq('organization_id', organization_id)
      .maybeSingle();

    const approvalStatus = role === 'faculty' ? 'pending' : 'approved'; // Faculty needs approval

    if (existingRole) {
      if (!isNewUser) {
        // An existing user already holds a different kind of role in this org
        // (admin, recruiter, ...). Never rewrite it from a public signup form.
        return NextResponse.json(
          { error: 'This account already has a role in this organization. Please sign in.', shouldSignIn: true },
          { status: 409 }
        );
      }
      // Brand new user: normalise the trigger-created row to the requested role
      if (existingRole.role !== role) {
        const { error: updateError } = await adminClient
          .from('user_roles')
          .update({
            role,
            approval_status: approvalStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRole.id);

        if (updateError) {
          console.error('[SIGNUP] Failed to update role:', updateError.message);
        }
      }
    } else {
      // Create new role entry (explicit organization_id and approval_status)
      const { error: roleError } = await adminClient
        .from('user_roles')
        .insert({
          user_id: userId,
          organization_id,
          role,
          approval_status: approvalStatus,
          assigned_by: null
        });

      if (roleError) {
        console.error('[SIGNUP] Role assignment failed:', roleError.code, roleError.message);
        if (roleError.code === '23505' && !isNewUser) {
          // unique (user_id, organization_id) violation: already has a role in this org
          return NextResponse.json(
            { error: 'This account already has a role in this organization. Please sign in.', shouldSignIn: true },
            { status: 409 }
          );
        }
        if (isNewUser) {
          // Rollback: delete the auth user we just created
          await adminClient.auth.admin.deleteUser(userId);
        }
        return NextResponse.json(
          { error: 'Failed to assign role' },
          { status: 500 }
        );
      }
    }

    // Create profile with additional fields
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name,
        // No role here: profiles has no role column; authorization comes from user_roles only.
        organization_id,
        university: university || null,
        major: major || null,
        graduation_year: graduation_year || null,
        location: location || null,
        gpa: gpa || null
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      // Don't rollback - profile creation is not critical, can be completed later
      console.error('[SIGNUP] Profile upsert failed for user', userId, profileError.message);
    }

    // Determine if user is OAuth (existing user) or email/password (new user)
    const successMessage = isNewUser 
      ? 'Account created successfully! Please verify your email.'
      : 'Account setup completed! Signing you in...';

    const response = {
      success: true,
      userId,
      email,
      isNewUser,
      message: successMessage,
      shouldSignIn: !isNewUser, // OAuth users (existing) can sign in, new users need to verify email
      requiresEmailVerification: isNewUser // Only new email/password users need verification
    };

    return NextResponse.json(response, { status: isNewUser ? 201 : 200 });

  } catch (error: unknown) {
    console.error('[SIGNUP] Error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
