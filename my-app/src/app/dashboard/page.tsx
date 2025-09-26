import { redirect } from 'next/navigation';
import { getServerUserWithRole, createSupabaseServerClient } from '../../../lib/supabaseServer';

export default async function DashboardRedirectPage() {
  const { user, role } = await getServerUserWithRole();
  
  if (!user) {
    redirect('/login');
  }

  if (role === 'admin') {
    redirect('/admin/dashboard');
  }
  
  if (role === 'faculty') {
    redirect('/faculty/dashboard');
  }

  // For students, always check if profile is complete
  if (role === 'student') {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, university, graduation_year, major')
        .eq('id', user.id)
        .maybeSingle();
      
      // If profile is missing or incomplete, redirect to onboarding
      if (!prof || !prof.full_name || !prof.university || !prof.graduation_year || !prof.major) {
        console.log('Student profile incomplete, redirecting to onboarding');
        redirect('/onboarding');
      }
    } catch (error) {
      console.error('Error checking profile:', error);
      // If we can't check profile, redirect to onboarding to be safe
      redirect('/onboarding');
    }
  }

  redirect('/student/dashboard');
}


