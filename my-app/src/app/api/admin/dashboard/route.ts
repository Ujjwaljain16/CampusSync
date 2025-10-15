import { withRole, success } from '@/lib/api';

export const GET = withRole(['admin'], async (_req, { user }) => {
  // Return basic admin dashboard data
  return success({
    user: {
      id: user.id,
      email: user.email,
      role: 'admin'
    },
    stats: {
      total_users: 0,
      total_certificates: 0,
      pending_approvals: 0,
      system_health: 'good'
    },
    recent_activity: [],
    message: 'Admin dashboard working!'
  });
});