# 🛠️ CampusSync Administration Scripts

This directory contains utility scripts for managing and maintaining your CampusSync deployment.

---

## 📜 Available Scripts

### 1. `setup-superadmin.mjs`
**Purpose**: Create the first superadmin account for your CampusSync instance.

**What it does**:
- Creates a new superadmin user with system-wide access
- Bypasses RLS policies for full database access
- Sets up proper role assignments in `profiles` and `user_roles` tables
- Creates audit log entries in `super_admin_audit` table
- Can also upgrade existing users to superadmin role

**Usage**:
```bash
# Navigate to the my-app directory
cd my-app

# Run the script
node scripts/setup-superadmin.mjs
```

**Prerequisites**:
- Environment variables must be set in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

**Interactive Prompts**:
The script will ask you for:
1. **Email address** - Must be valid email format
2. **Password** - Minimum 8 characters
3. **Full Name** - Display name for the admin
4. **Phone Number** - Optional contact info

**Example Session**:
```
╔══════════════════════════════════════════════════════════╗
║     🚀 CampusSync Superadmin Setup Script              ║
╚══════════════════════════════════════════════════════════╝

✅ Connected to Supabase

📝 Please provide the following information:

Email address: admin@campussync.com
Password (min 8 characters): ********
Full Name: John Doe
Phone Number (optional): +1234567890

🔍 Checking if user already exists...

👤 Creating new superadmin user...
   ✓ Auth user created
   ✓ Profile created
   ✓ Role assigned

✅ Superadmin user created successfully!

╔══════════════════════════════════════════════════════════╗
║                Account Details                           ║
╠══════════════════════════════════════════════════════════╣
║ Email:    admin@campussync.com                          ║
║ User ID:  abc123-def456-ghi789                          ║
║ Role:     super_admin                                    ║
╚══════════════════════════════════════════════════════════╝
```

**Superadmin Capabilities**:
- ✅ Access all organizations
- ✅ Manage system settings
- ✅ View complete audit logs
- ✅ Bypass RLS policies
- ✅ Create and manage organizations
- ✅ Manage all users across organizations
- ✅ Access super admin dashboard at `/admin`

---

### 2. `db-audit.js`
**Purpose**: Audit and verify database integrity.

**What it does**:
- Checks for orphaned records
- Validates data consistency
- Reports database health metrics

**Usage**:
```bash
node scripts/db-audit.js
```

---

## 🔒 Security Best Practices

### For `setup-superadmin.mjs`:

1. **Run Once**: Only run this script during initial setup or when creating additional superadmins
2. **Secure Credentials**: Never commit passwords or service role keys to version control
3. **Access Control**: Limit who can execute this script (requires service role key)
4. **Audit Trail**: All superadmin actions are logged in `super_admin_audit` table
5. **Environment Isolation**: Use different superadmins for dev/staging/production

### Password Requirements:
- Minimum 8 characters
- Recommend: Mix of uppercase, lowercase, numbers, and special characters
- Consider using a password manager to generate strong passwords

---

## 🗃️ Database Tables Modified

### `setup-superadmin.mjs` affects:
1. **`auth.users`** (Supabase Auth)
   - Creates authenticated user account
   - Sets email_confirm to true

2. **`profiles`**
   - Creates user profile with `super_admin` role
   - Sets `organization_id` to NULL (system-wide access)

3. **`user_roles`**
   - Assigns `super_admin` role
   - Tracks who assigned the role

4. **`super_admin_audit`**
   - Logs the creation/upgrade action
   - Tracks timestamp and details

---

## 🐛 Troubleshooting

### Error: "Missing required environment variables"
**Solution**: Ensure your `.env.local` file contains:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Error: "Failed to create auth user"
**Possible causes**:
- Email already exists in auth.users
- Invalid service role key
- Supabase project is paused/inactive
- Network connectivity issues

**Solution**: 
- Check if user exists and choose to upgrade instead
- Verify service role key is correct
- Check Supabase dashboard for project status

### Error: "Failed to create profile"
**Possible causes**:
- Database constraints violation
- Missing required tables
- RLS policies blocking insert

**Solution**: 
- Ensure database migrations are up to date
- Verify tables exist: `profiles`, `user_roles`, `super_admin_audit`
- Check Supabase logs for detailed error

---

## 📊 Verification

After running `setup-superadmin.mjs`, verify the setup:

### 1. Check Database
```sql
-- Verify user in profiles table
SELECT id, email, role, organization_id 
FROM profiles 
WHERE role = 'super_admin';

-- Verify role assignment
SELECT user_id, role, assigned_by, created_at 
FROM user_roles 
WHERE role = 'super_admin';

-- Check audit log
SELECT * FROM super_admin_audit 
WHERE action IN ('SUPERADMIN_CREATED', 'UPGRADE_TO_SUPERADMIN')
ORDER BY created_at DESC 
LIMIT 5;
```

### 2. Test Login
1. Navigate to your CampusSync app
2. Go to `/login`
3. Use the email and password you created
4. Verify you can access `/admin` dashboard

### 3. Test Permissions
- Try accessing multiple organizations
- Verify you can see all data across organizations
- Check that audit logs are being created for your actions

---

## 🔄 Upgrading Existing Users

If you need to upgrade an existing user to superadmin:

1. Run `setup-superadmin.mjs`
2. Enter the existing user's email
3. When prompted that user exists, type `yes` to upgrade
4. The script will update their role without changing their password

---

## 📝 Notes

- All scripts use the Supabase Admin Client with service role key
- Scripts bypass RLS policies for administrative operations
- All actions are logged for security and compliance
- Scripts are idempotent where possible (safe to re-run)

---

## 🆘 Support

If you encounter issues:
1. Check the error message carefully
2. Verify environment variables are set correctly
3. Check Supabase dashboard for project status
4. Review database logs in Supabase
5. Ensure you're using the latest version of dependencies

For more information, refer to:
- [CampusSync Documentation](../docs/)
- [Supabase Admin API Docs](https://supabase.com/docs/reference/javascript/admin-api)
