import { redirect } from 'next/navigation';
import { getServerUserWithRole } from '../../../lib/supabaseServer';

export default async function DashboardRedirectPage() {
  const { user, role } = await getServerUserWithRole();
  
  console.log('Dashboard redirect - User:', !!user, 'Email:', user?.email, 'Role:', role);
  
  if (!user) {
    console.log('No user found, redirecting to login');
    redirect('/login');
  }

  if (role === 'admin') {
    console.log('Admin user, redirecting to admin dashboard');
    redirect('/admin/dashboard');
  }
  
  if (role === 'faculty') {
    console.log('Faculty user, redirecting to faculty dashboard');
    redirect('/faculty/dashboard');
  }

  console.log('Student user, redirecting to student dashboard');
  redirect('/student/dashboard');
}


