import { redirect } from 'next/navigation';
import { getServerUserWithRole } from '../../../lib/supabaseServer';

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

  redirect('/student/upload');
}


