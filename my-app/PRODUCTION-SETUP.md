# Production Setup Guide

## How Real Users Will Use This System

### **For End Users (Students/Faculty):**
1. **Sign up** → Automatically get 'student' role
2. **Login** → Redirected to appropriate dashboard
3. **Use the app** → No role management needed

### **For Institution Administrators:**
1. **Get initial admin access** → Set up by system administrator
2. **Use admin dashboard** → Invite users and assign roles
3. **Manage the system** → All through the web interface

## Initial Setup (One-time)

### Step 1: Deploy the Application
```bash
# Deploy your Next.js app to Vercel/Netlify/etc
npm run build
# Deploy to your hosting platform
```

### Step 2: Set Up Database
1. **Run the SQL migration** in Supabase Dashboard
2. **Create first admin user** using one of these methods:

#### Method A: Manual SQL (Recommended for initial setup)
```sql
-- In Supabase SQL Editor, replace with actual user ID
INSERT INTO user_roles (user_id, role, assigned_by) 
VALUES ('your-user-id-here', 'admin', 'your-user-id-here');
```

#### Method B: Use the setup script
```bash
# Add service role key to environment
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Run setup script
node scripts/setup-admin.js
```

### Step 3: Configure Email (Optional)
If you want email invitations to work:
1. **Set up SMTP** in Supabase Dashboard → Settings → Auth
2. **Configure email templates** for invitations
3. **Test email delivery**

## Daily Operations

### **Admin Workflow:**
1. **Login** → Redirected to `/admin/dashboard`
2. **Invite users** → Click "Invite User" button
3. **Assign roles** → Use the user management table
4. **Monitor system** → View all users and their roles

### **Faculty Workflow:**
1. **Login** → Redirected to `/faculty/dashboard`
2. **Review certificates** → Approve/reject student uploads
3. **Issue credentials** → Automatically when approving

### **Student Workflow:**
1. **Sign up** → Get 'student' role automatically
2. **Login** → Redirected to `/student/upload`
3. **Upload certificates** → Wait for faculty approval
4. **View portfolio** → Access public portfolio page

## Security Features

- **Row Level Security (RLS)** → Database-level protection
- **Role-based access control** → API and UI protection
- **Automatic role assignment** → New users get 'student' role
- **Admin-only role management** → Only admins can change roles

## Monitoring & Maintenance

### **Check System Health:**
```bash
# Test role system
node scripts/test-roles.js

# Check for errors in logs
# Monitor Supabase dashboard for issues
```

### **User Management:**
- **View all users** → Admin dashboard
- **Assign roles** → Admin dashboard
- **Remove users** → Admin dashboard or Supabase Auth

## Troubleshooting

### **Common Issues:**
1. **User can't access admin dashboard** → Check if they have admin role
2. **New users not getting student role** → Check database trigger
3. **Email invitations not working** → Check SMTP configuration

### **Emergency Access:**
If you lose admin access:
1. **Use Supabase Dashboard** → Directly modify user_roles table
2. **Reset user role** → Update role in database
3. **Create new admin** → Add admin role via SQL

## Production Checklist

- [ ] SQL migration run successfully
- [ ] First admin user created
- [ ] Email configuration (if using invitations)
- [ ] Environment variables set
- [ ] SSL certificate configured
- [ ] Backup strategy in place
- [ ] Monitoring set up
- [ ] User documentation created
