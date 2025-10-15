import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { apiError } from '@/lib/api';

function coerceProfilePayload(base: Record<string, unknown>, extras: Record<string, unknown>) {
	// Build initial payload using safe known columns
	const payload: Record<string, unknown> = {
		id: base.id,
		full_name: extras.full_name,
		role: extras.role || 'student', // Default to student if not specified
		email: base.email, // Include email from auth user
	};
	// Optimistically include optional fields if present in request
	['university', 'graduation_year', 'major', 'location', 'gpa'].forEach((k) => {
		if (extras[k] !== undefined && extras[k] !== null && extras[k] !== '') {
			payload[k] = extras[k];
		}
	});
	return payload;
}

export async function POST(request: NextRequest) {
	const body = await request.json() as Record<string, unknown>;
	const access_token = body.access_token as string;
	const refresh_token = body.refresh_token as string;
	// Support both snake_case and camelCase keys for safety
	const full_name = (body.full_name ?? body.fullName ?? '') as string;
	const university = body.university as string | undefined;
	const graduation_year = (body.graduation_year ?? body.graduationYear) as string | undefined;
	const major = body.major as string | undefined;
	const location = body.location as string | undefined;
	const gpa = body.gpa as string | undefined;

	if (!access_token || !refresh_token) {
		throw apiError.badRequest('Missing tokens');
	}

	const response = NextResponse.json({ ok: true });

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookies) {
					cookies.forEach(({ name, value, options }) => {
						response.cookies.set(name, value, options);
					});
				},
			},
		}
	);

	// Establish session first so RLS allows profile/roles writes
	if (refresh_token) {
		const { error: setSessionError } = await supabase.auth.setSession({ 
			access_token, 
			refresh_token
		});
		if (setSessionError) {
			console.error('[complete-signup] setSessionError:', setSessionError);
			// Don't fail completely, try to continue without session
			console.log('[complete-signup] Continuing without session...');
		}
	} else {
		console.warn('[complete-signup] refresh_token missing; skipping setSession');
	}

	const { data: { user }, error: userError } = await supabase.auth.getUser();
	if (userError || !user) {
		console.error('[complete-signup] getUser error:', userError);
		throw apiError.internal(userError?.message || 'User not found');
	}

	// ALWAYS create/update profile first (required for foreign key constraint on role_requests)
	const role = body.role || 'student'; // Get role from request body
	const profileFullName = (typeof full_name === 'string' && full_name.trim().length > 0) 
		? full_name.trim() 
		: 'New User'; // Fallback name if not provided
		
	const attempt = coerceProfilePayload(
		{ id: user.id, email: user.email }, 
		{ full_name: profileFullName, role, university, graduation_year, major, location, gpa }
	);
	
	let profileError: unknown = null;
	try {
		const { error } = await supabase.from('profiles').upsert(attempt, { onConflict: 'id' });
		profileError = error;
		if (!error) {
			console.log('[complete-signup] Profile created/updated successfully');
		}
	} catch (e: unknown) {
		console.error('[complete-signup] profile upsert exception:', e);
		profileError = e;
	}
	
	if (profileError) {
		// Retry with only known-safe columns
		const minimal: Record<string, unknown> = { id: user.id, full_name: profileFullName, email: user.email };
		const { error: retryErr } = await supabase.from('profiles').upsert(minimal, { onConflict: 'id' });
		if (retryErr) {
			console.error('[complete-signup] minimal profile upsert failed:', retryErr);
			throw apiError.internal(retryErr.message || 'Profile upsert failed');
		}
		console.log('[complete-signup] Profile created with minimal data on retry');
	}

	// Assign roles based on role (role variable already defined above)
	console.log('[complete-signup] Processing role:', role, 'for user:', user.id);
	
	if (role === 'student' || !role) {
		// Ensure user_roles has student role (best-effort under RLS)
		try {
			await supabase.rpc('ensure_student_role', { p_user_id: user.id });
			console.log('[complete-signup] Student role assigned successfully');
		} catch (e) {
			console.error('[complete-signup] ensure_student_role exception:', e);
		}
	} else {
		// Create role request for recruiter/faculty/admin
		console.log('[complete-signup] Creating role request for:', role);
		try {
			const { data: insertData, error: rrError } = await supabase.from('role_requests').insert({
				user_id: user.id,
				requested_role: role,
				status: 'pending',
				metadata: { source: 'complete-signup', timestamp: new Date().toISOString() }
			}).select();
			
			if (rrError) {
				console.error('[complete-signup] role request insert error:', rrError);
				console.error('[complete-signup] error details:', JSON.stringify(rrError, null, 2));
			} else {
				console.log('[complete-signup] role request created successfully:', insertData);
			}
		} catch (e) {
			console.error('[complete-signup] role request insert exception:', e);
		}
	}

	return response;
}


