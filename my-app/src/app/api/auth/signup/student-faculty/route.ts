import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

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
    const emailDomain = email.toLowerCase().split('@')[1];
    const settings = org.settings as { allowed_email_domains?: string[] };
    const allowedDomains = settings?.allowed_email_domains || [];
    
    if (!allowedDomains.some(d => d.toLowerCase() === emailDomain)) {
      return NextResponse.json(
        { error: 'Email domain not authorized for this organization' },
        { status: 403 }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      
      // Check ALL roles for this user
      const { data: existingRoles } = await adminClient
        .from('user_roles')
        .select('id, role, organization_id, approval_status')
        .eq('user_id', userId);

      console.log('[STUDENT_FACULTY_SIGNUP] Existing roles:', existingRoles);

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
          shouldSignIn: true
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
        console.log('[STUDENT_FACULTY_SIGNUP] User belongs to different organization, allowing multi-org');
        // Allow multi-org - continue to role assignment below
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

      // IMPORTANT: Admin API doesn't auto-send confirmation emails!
      // Manually trigger the confirmation email
      try {
        const { error: emailError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000'}/login`
        });
        
        if (emailError) {
          console.error('[SIGNUP] Failed to send confirmation email:', emailError);
          // Don't fail the signup - user can resend later
        } else {
          console.log('[SIGNUP] Confirmation email sent to:', email);
        }
      } catch (emailError) {
        console.error('[SIGNUP] Error sending confirmation email:', emailError);
        // Don't fail the signup
      }
    }

    // Check if user_roles entry already exists (from trigger)
    const { data: existingRole } = await adminClient
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId)
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (existingRole) {
      // Update existing role to student if it's not already
      if (existingRole.role !== 'student') {
        const { error: updateError } = await adminClient
          .from('user_roles')
          .update({ 
            role: role, // Use the role from request instead of hardcoded 'student'
            approval_status: role === 'faculty' ? 'pending' : 'approved', // Faculty needs approval
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRole.id);

        if (updateError) {
          console.error('[SIGNUP] Failed to update role:', updateError);
        }
      }
    } else {
    // Create new role entry
    const { error: roleError } = await adminClient
      .from('user_roles')
      .insert({
        user_id: userId,
        organization_id,
        role: role, // Use the role from request instead of hardcoded 'student'
        approval_status: role === 'faculty' ? 'pending' : 'approved', // Faculty needs approval, students auto-approved
        assigned_by: null
      });      if (roleError) {
        console.error('[SIGNUP] Role assignment failed:', roleError);
        // Rollback: delete auth user
        await adminClient.auth.admin.deleteUser(userId);
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
        role: role, // Use the role from request instead of hardcoded 'student'
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
    }

    const successMessage = isNewUser 
      ? 'Account created successfully! Signing you in...'
      : 'Account setup completed! Signing you in...';

    return NextResponse.json({
      success: true,
      userId,
      email,
      isNewUser,
      message: successMessage,
      shouldSignIn: true
    }, { status: isNewUser ? 201 : 200 });

  } catch (error: unknown) {
    console.error('[SIGNUP] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
