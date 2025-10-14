import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function coerceProfilePayload(base: Record<string, any>, extras: Record<string, any>) {
	// Build initial payload using safe known columns
	const payload: Record<string, any> = {
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
	try {
		const body = await request.json();
		const access_token = body.access_token;
		const refresh_token = body.refresh_token;
		// Support both snake_case and camelCase keys for safety
		const full_name = body.full_name ?? body.fullName ?? '';
		const university = body.university;
		const graduation_year = body.graduation_year ?? body.graduationYear;
		const major = body.major;
		const location = body.location;
		const gpa = body.gpa;
		const requested_role: 'student' | 'recruiter' | 'faculty' | 'admin' | undefined = body.requested_role ?? body.requestedRole;

		if (!access_token || !refresh_token) {
			return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
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
			return NextResponse.json({ error: userError?.message || 'User not found' }, { status: 500 });
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
		
		let profileError: any = null;
		try {
			const { error } = await supabase.from('profiles').upsert(attempt, { onConflict: 'id' });
			profileError = error;
			if (!error) {
				console.log('[complete-signup] Profile created/updated successfully');
			}
		} catch (e: any) {
			console.error('[complete-signup] profile upsert exception:', e);
			profileError = e;
		}
		
		if (profileError) {
			// Retry with only known-safe columns
			const minimal: any = { id: user.id, full_name: profileFullName, email: user.email };
			const { error: retryErr } = await supabase.from('profiles').upsert(minimal, { onConflict: 'id' });
			if (retryErr) {
				console.error('[complete-signup] minimal profile upsert failed:', retryErr);
				return NextResponse.json({ error: retryErr.message || 'Profile upsert failed' }, { status: 500 });
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
	} catch (error: any) {
		console.error('[complete-signup] unexpected error:', error);
		return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
	}
}


