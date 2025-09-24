const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('❌ Missing Supabase environment variables');
	process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function createFaculty() {
	console.log('🔍 Creating faculty user and assigning role...\n');

	const email = 'faculty@test.com';
	const password = 'password123';

	try {
		// 1) Create auth user (or find if exists)
		let user = null;
		const { data: list, error: listErr } = await admin.auth.admin.listUsers();
		if (listErr) {
			console.error('❌ Error listing users:', listErr);
			return;
		}
		user = list.users.find(u => u.email === email) || null;

		if (!user) {
			const { data: created, error: createErr } = await admin.auth.admin.createUser({
				email,
				email_confirm: true,
				password,
			});
			if (createErr) {
				console.error('❌ Error creating user:', createErr);
				return;
			}
			user = created.user;
			console.log('✅ Created user:', email);
		} else {
			console.log('✅ Found existing user:', email);
		}

		// 2) Ensure profile row exists with minimal fields only
		let r = await admin.from('profiles').upsert({ id: user.id, role: 'faculty' });
		if (r.error) {
			console.error('❌ Error creating profile row:', r.error);
			return;
		}
		// Try to update name column variants without non-existent timestamps
		await admin.from('profiles').update({ name: 'Test Faculty' }).eq('id', user.id);
		await admin.from('profiles').update({ full_name: 'Test Faculty' }).eq('id', user.id);
		await admin.from('profiles').update({ university: 'Demo University' }).eq('id', user.id);
		console.log('✅ Profile created/updated');

		// 3) Assign role in user_roles
		const { error: roleErr } = await admin
			.from('user_roles')
			.upsert({
				user_id: user.id,
				role: 'faculty',
				assigned_by: user.id,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}, { onConflict: 'user_id' });
		if (roleErr) {
			console.error('❌ Error assigning faculty role:', roleErr);
			return;
		}
		console.log('✅ Faculty role assigned');

		console.log('\n🎉 Faculty setup completed!');
		console.log('📧 Email:', email);
		console.log('🔑 Password:', password);
		console.log('🔗 Login at: http://localhost:3000/login');
		console.log('🧑‍🏫 Dashboard: http://localhost:3000/faculty/dashboard');
	} catch (err) {
		console.error('💥 Error setting up faculty:', err);
	}
}

createFaculty();
