import { type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { success, apiError, parseAndValidateBody } from '@/lib/api';

interface DevUpsertBody {
  email: string;
  password: string;
  role?: string;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    throw apiError.forbidden('Not allowed');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw apiError.internal('Missing Supabase env vars');
  }

  const result = await parseAndValidateBody<DevUpsertBody>(request, ['email', 'password']);
  if (result.error) return result.error;
  
  const { email, password, role } = result.data;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find existing user
  const { data: users, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    throw apiError.internal(listError.message);
  }
  const existing = users.users.find((u) => u.email === email);

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: role ? { invited_role: role } : undefined,
    });
    if (error) {
      throw apiError.internal(error.message);
    }
    return success({ ok: true, created: true, userId: data.user.id });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    email_confirm: true,
    password,
    user_metadata: role ? { invited_role: role } : undefined,
  });
  if (updateError) {
    throw apiError.internal(updateError.message);
  }

  return success({ ok: true, created: false, userId: existing.id });
}



