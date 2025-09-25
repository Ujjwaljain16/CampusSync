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

  // Onboarding gate: if profile missing minimal info, send to /onboarding
  try {
    const supabase = await createSupabaseServerClient();
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (!prof || !prof.full_name) {
      redirect('/onboarding');
    }
  } catch {}

  redirect('/student/dashboard');
}


