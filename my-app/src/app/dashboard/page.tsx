import { redirect } from 'next/navigation';
import { getServerUserWithRole, createSupabaseServerClient } from '@/lib/supabaseServer';

export default async function DashboardRedirectPage() {
  const result = await getServerUserWithRole();
  
  if (!result || !result.user) {
    redirect('/login');
  }

  const { user, role, approvalStatus } = result;

  // Super admin gets their own dashboard
  if (role === 'super_admin') {
    redirect('/admin/super');
  }

  // Org admin and admin go to admin dashboard
  if (role === 'admin' || role === 'org_admin') {
    redirect('/admin/dashboard');
  }
  
  // Faculty - check approval status first
  if (role === 'faculty') {
    // If pending approval, redirect to waiting page
    if (approvalStatus === 'pending') {
      redirect('/faculty/waiting');
    }
    // If denied, redirect to waiting page (shows denied message)
    if (approvalStatus === 'denied') {
      redirect('/faculty/waiting');
    }
    // If approved, go to faculty dashboard
    redirect('/faculty/dashboard');
  }

  // Recruiter - check approval status first
  if (role === 'recruiter') {
    // If pending approval, redirect to waiting page
    if (approvalStatus === 'pending') {
      redirect('/recruiter/waiting');
    }
    // If denied, redirect to waiting page (shows denied message)
    if (approvalStatus === 'denied') {
      redirect('/recruiter/waiting');
    }
    // If approved, go to recruiter dashboard
    redirect('/recruiter/dashboard');
  }

  // For students, check if profile is complete (only full_name is required now)
  // Other fields (university, major, etc.) are collected during signup, so we don't require them here
  if (role === 'student') {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      
      // Only redirect to onboarding if full_name is missing (shouldn't happen with new signup flow)
      if (!prof || !prof.full_name) {
          redirect('/onboarding');
      }
    } catch (error) {
      console.error('Error checking profile:', error);
      // If we can't check profile, still allow access to dashboard
    }
    
    // Student with complete profile goes to student dashboard
    redirect('/student/dashboard');
  }

  // Fallback: if no role matched, redirect to login
  console.error('Unknown role or no role assigned:', role);
  redirect('/login');
}


