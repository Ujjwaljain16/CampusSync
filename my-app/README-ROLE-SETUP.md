# Role Management System Setup

## Overview
The role management system has been implemented with a proper database-backed approach using a `user_roles` table.

## Database Setup

1. **Run the migration** in your Supabase SQL editor:
   ```sql
   -- Copy and paste the contents of supabase-migrations/001_create_user_roles.sql
   ```

2. **Set up your first admin user**:
   - Create a user account through the normal signup process
   - Note the user's email and ID
   - Run the setup script (optional):
     ```bash
     cd my-app
     node scripts/setup-admin.js
     ```
   - Or manually insert in Supabase SQL editor:
     ```sql
     INSERT INTO user_roles (user_id, role, assigned_by) 
     VALUES ('your-user-id-here', 'admin', 'your-user-id-here');
     ```

## How It Works

### Role Assignment
- **Default**: All new users automatically get 'student' role via database trigger
- **Admin Assignment**: Admins can assign roles through `/admin/dashboard`
- **API**: Role management via `/api/admin/roles` endpoints

### Role-Based Access
- **Students**: Can upload certificates, view their portfolio
- **Faculty**: Can review and approve/reject certificates
- **Admins**: Can manage user roles, access all features

### Database Schema
```sql
user_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  role TEXT CHECK (role IN ('student', 'faculty', 'admin')),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## Testing the System

1. **Create test users**:
   - Sign up with different emails
   - All will default to 'student' role

2. **Assign admin role**:
   - Use the admin dashboard or SQL editor
   - Login as admin to access `/admin/dashboard`

3. **Test role-based redirects**:
   - Admin → `/admin/dashboard`
   - Faculty → `/faculty/dashboard`  
   - Student → `/student/upload`

## API Endpoints

- `GET /api/admin/roles` - List all users and roles (admin only)
- `POST /api/admin/roles` - Assign/update user role (admin only)
- `DELETE /api/admin/roles?user_id=X` - Remove role (admin only)

## Security Features

- Row Level Security (RLS) enabled
- Only admins can manage roles
- Users can only read their own role
- Automatic role assignment on user creation
