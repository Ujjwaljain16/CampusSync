import { withRole, success } from '@/lib/api';

export const GET = withRole(['recruiter'], async (_req, { user }) => {
  // Return basic recruiter dashboard data
  return success({
    user: {
      id: user.id,
      email: user.email,
      role: 'recruiter'
    },
    analytics: {
      total_verifications: 0,
      successful_verifications: 0,
      pending_verifications: 0,
      verification_rate: 0
    },
    recent_verifications: [],
    message: 'Recruiter dashboard working!'
  });
});