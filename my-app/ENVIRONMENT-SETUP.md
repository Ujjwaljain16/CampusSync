# Environment Setup Guide

## Quick Start

CampusSync requires Supabase configuration to work properly. Follow these steps to get started:

### 1. Create Environment File

Create a file named `.env.local` in your project root directory (`my-app/.env.local`):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OAuth Configuration (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Email Configuration (Optional)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

### 2. Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or select an existing one
3. Navigate to **Settings** → **API**
4. Copy the following values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Set Up Database

1. In your Supabase project, go to **SQL Editor**
2. Run the migration files from `supabase-migrations/` directory in order:
   - `001_create_user_roles.sql`
   - `002_fix_user_roles_policies.sql`
   - `003_disable_rls_temporarily.sql`
   - `004_enable_pgcrypto.sql`
   - `005_add_verification_tables.sql`
   - `006_fix_user_role_trigger.sql`
   - `007_disable_user_roles_rls.sql`
   - `008_create_get_user_role_function.sql`
   - `009_harden_assign_default_role.sql`
   - `010_assign_default_role_exception_guard.sql`
   - `011_add_vc_revocation.sql`
   - `012_add_allowed_domains.sql`

### 4. Restart Development Server

```bash
npm run dev
```

### 5. Access the Application

1. Open [http://localhost:3000](http://localhost:3000)
2. If environment is not configured, you'll be redirected to `/setup`
3. Follow the setup instructions to create your first admin account

## Troubleshooting

### "Missing Supabase environment variables" Error

This means your `.env.local` file is missing or has placeholder values. Make sure:

1. The file exists in `my-app/.env.local`
2. All values are replaced with actual Supabase credentials
3. No quotes around the values
4. No spaces around the `=` sign

### Authentication Not Working

1. Check that your Supabase project is active
2. Verify the URL and keys are correct
3. Ensure the database migrations have been run
4. Check the browser console for errors

### Database Connection Issues

1. Verify your Supabase project is not paused
2. Check that the service role key has the correct permissions
3. Ensure all migration files have been executed successfully

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key for client-side auth | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### Optional Variables

| Variable | Description | When to Use |
|----------|-------------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | If using Google sign-in |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | If using Google sign-in |
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID | If using Microsoft sign-in |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret | If using Microsoft sign-in |
| `SMTP_HOST` | SMTP server for email | If using email invitations |
| `SMTP_PORT` | SMTP port (usually 587) | If using email invitations |
| `SMTP_USER` | SMTP username | If using email invitations |
| `SMTP_PASS` | SMTP password | If using email invitations |

## Security Notes

- Never commit `.env.local` to version control
- Keep your service role key secure
- Use environment variables in production
- Regularly rotate your API keys

## Getting Help

If you're still having issues:

1. Check the browser console for error messages
2. Look at the terminal output for server errors
3. Verify your Supabase project settings
4. Ensure all database migrations are applied
5. Try creating a fresh Supabase project if needed
