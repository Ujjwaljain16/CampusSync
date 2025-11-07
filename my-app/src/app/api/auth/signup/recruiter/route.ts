import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

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

    console.log('[RECRUITER_SIGNUP] Creating recruiter account:', { email, company_name });

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      console.log('[RECRUITER_SIGNUP] User already exists:', userId);
      
      const isOAuthUser = existingUser.app_metadata?.provider && existingUser.app_metadata.provider !== 'email';
      
      // Check ALL roles for this user (both with and without organization_id)
      const { data: existingRoles } = await adminClient
        .from('user_roles')
        .select('id, role, organization_id, approval_status')
        .eq('user_id', userId);

      console.log('[RECRUITER_SIGNUP] Existing roles:', existingRoles);
      console.log('[RECRUITER_SIGNUP] Is OAuth user:', isOAuthUser);

      // Check if user already has a recruiter role
      const recruiterRole = existingRoles?.find(r => r.role === 'recruiter' && r.organization_id === null);
      
      if (recruiterRole) {
        // User already has recruiter account
        console.log('[RECRUITER_SIGNUP] User already has recruiter role, returning success');
        return NextResponse.json({
          success: true,
          userId,
          message: 'Account already exists. Please sign in or check your email for verification.',
          shouldSignIn: true
        }, { status: 200 });
      }

      // Check if user has ANY other role (student, faculty, admin, etc.)
      const otherRoles = existingRoles?.filter(r => r.role !== 'recruiter');
      
      console.log('[RECRUITER_SIGNUP] Other roles (non-recruiter):', otherRoles);
      
      if (otherRoles && otherRoles.length > 0) {
        const rolesList = otherRoles.map(r => `${r.role}${r.organization_id ? ' (org: ' + r.organization_id + ')' : ''}`).join(', ');
        console.log('[RECRUITER_SIGNUP] User already has other roles:', rolesList);
        
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
        console.log('[RECRUITER_SIGNUP] Setting password for OAuth user:', email);
        try {
          const { error: passwordError } = await adminClient.auth.admin.updateUserById(
            userId,
            { password }
          );
          
          if (passwordError) {
            console.error('[RECRUITER_SIGNUP] Failed to set password for OAuth user:', passwordError);
            // Don't fail the signup - they can still use OAuth
          } else {
            console.log('[RECRUITER_SIGNUP] ✅ Password set successfully for OAuth user');
          }
        } catch (err) {
          console.error('[RECRUITER_SIGNUP] Error setting password:', err);
          // Don't fail the signup - they can still use OAuth
        }
      }

      // User exists but has no roles at all - this shouldn't happen but we'll allow it
      console.log('[RECRUITER_SIGNUP] User exists but has no roles, adding recruiter role');
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
        console.error('[RECRUITER_SIGNUP] Auth user creation failed:', authError);
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
      console.log('[RECRUITER_SIGNUP] Auth user created:', userId);

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
          console.error('[RECRUITER_SIGNUP] Failed to send confirmation email:', resendError);
          console.log('[RECRUITER_SIGNUP] Note: User created but confirmation email not sent.');
        } else {
          console.log('[RECRUITER_SIGNUP] ✅ Confirmation email sent successfully to:', email);
        }
      } catch (emailError) {
        console.error('[RECRUITER_SIGNUP] Error sending confirmation email:', emailError);
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
        console.error('[RECRUITER_SIGNUP] Role assignment failed:', roleError);
        // Rollback: delete auth user
        await adminClient.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: 'Failed to assign role' },
          { status: 500 }
        );
      }

      // Create profile ONLY for new users (don't overwrite existing profile!)
      const { error: profileError } = await adminClient
        .from('profiles')
        .insert({
          id: userId,
          email,
          full_name,
          role: 'recruiter',
          organization_id: null // No default org
        });

      if (profileError) {
        console.error('[RECRUITER_SIGNUP] Profile creation failed:', profileError);
        // Don't rollback - profile creation is not critical
      }
    }

    console.log('[RECRUITER_SIGNUP] Recruiter account created successfully');

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
    console.error('[RECRUITER_SIGNUP] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
