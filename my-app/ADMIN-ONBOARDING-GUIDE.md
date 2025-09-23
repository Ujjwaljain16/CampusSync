# 🔐 Admin Onboarding Guide

## Overview
This guide explains how to create the first admin user for CampusSync and manage admin access.

## 🚀 **Method 1: Web Interface (Recommended)**

### **Step 1: Access Setup Page**
1. **Start your development server**: `npm run dev`
2. **Navigate to**: `http://localhost:3000/admin/setup`
3. **You'll see the admin setup form**

### **Step 2: Fill Out Admin Details**
- **Admin Setup Key**: `campusync-admin-setup-2024` (default)
- **Full Name**: Your full name
- **Email**: Your admin email address
- **Password**: Strong password (8+ characters)
- **Confirm Password**: Same password

### **Step 3: Create Admin**
- **Click "Create Admin User"**
- **Wait for success message**
- **You'll be redirected to admin dashboard**

## 🛠️ **Method 2: Command Line Script**

### **Step 1: Run the Script**
```bash
node scripts/create-first-admin.js
```

### **Step 2: Follow Prompts**
- **Enter admin email**
- **Enter admin password**
- **Enter full name**

### **Step 3: Verify Setup**
- **Check admin dashboard**: `http://localhost:3000/admin/dashboard`
- **Login with your credentials**

## 🔧 **Method 3: Direct API Call**

### **Step 1: Make API Request**
```bash
curl -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@university.edu",
    "password": "YourStrongPassword123!",
    "fullName": "Admin User",
    "adminKey": "campusync-admin-setup-2024"
  }'
```

### **Step 2: Verify Response**
- **Should return success message**
- **Admin user created in database**

## 🔒 **Security Features**

### **Admin Setup Key**
- **Default Key**: `campusync-admin-setup-2024`
- **Environment Variable**: `ADMIN_SETUP_KEY`
- **Purpose**: Prevents unauthorized admin creation

### **Password Requirements**
- **Minimum Length**: 8 characters
- **Recommended**: Mix of letters, numbers, symbols
- **Example**: `AdminPass123!`

### **Email Validation**
- **Educational Emails**: Preferred (automatically added to allowed domains)
- **Personal Emails**: Allowed but not added to allowed domains
- **Examples**:
  - ✅ `admin@university.edu` (Educational)
  - ✅ `admin@gmail.com` (Personal, but allowed for admin)

## 📊 **What Happens During Setup**

### **1. User Creation**
- **Auth User**: Created in Supabase Auth
- **Email Confirmation**: Automatically confirmed
- **User Metadata**: Full name and role stored

### **2. Role Assignment**
- **Admin Role**: Assigned in `user_roles` table
- **Self-Assigned**: First admin assigns role to themselves
- **Audit Trail**: Creation timestamp recorded

### **3. Domain Management**
- **Educational Domain**: Added to `allowed_domains` if educational
- **Personal Domain**: Not added to allowed domains
- **Automatic**: No manual intervention needed

### **4. Database Setup**
- **Tables Created**: `user_roles`, `allowed_domains`
- **Policies Applied**: Row Level Security enabled
- **Indexes Created**: For optimal performance

## 🎯 **After Admin Creation**

### **Immediate Access**
- **Admin Dashboard**: `http://localhost:3000/admin/dashboard`
- **User Management**: Create additional admins
- **Role Assignment**: Assign roles to users
- **Domain Management**: Add/remove allowed domains

### **Next Steps**
1. **Create Additional Admins**: Use admin dashboard
2. **Configure System Settings**: Set up email, notifications
3. **Add Educational Domains**: Configure allowed domains
4. **Test User Registration**: Verify email validation works

## 🔄 **Creating Additional Admins**

### **Via Admin Dashboard**
1. **Login to admin dashboard**
2. **Go to User Management**
3. **Click "Create New User"**
4. **Fill out user details**
5. **Assign admin role**

### **Via API**
```bash
curl -X POST http://localhost:3000/api/auth/assign-role \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "role": "admin",
    "adminEmail": "admin@university.edu"
  }'
```

## 🛡️ **Security Best Practices**

### **Admin Setup Key**
- **Change Default**: Set custom `ADMIN_SETUP_KEY` in environment
- **Keep Secret**: Don't commit to version control
- **Rotate Regularly**: Change periodically

### **Password Security**
- **Strong Passwords**: Use password manager
- **Unique Passwords**: Different from other accounts
- **Regular Updates**: Change passwords periodically

### **Access Control**
- **Limit Admins**: Only create necessary admin accounts
- **Monitor Access**: Check admin activity logs
- **Revoke Access**: Remove admin roles when needed

## 🚨 **Troubleshooting**

### **Common Issues**

#### **"Admin already exists"**
- **Cause**: Admin user already created
- **Solution**: Use existing admin credentials or create additional admin

#### **"Invalid admin setup key"**
- **Cause**: Wrong setup key provided
- **Solution**: Check environment variable or use default key

#### **"Failed to create auth user"**
- **Cause**: Supabase configuration issue
- **Solution**: Check environment variables and Supabase connection

#### **"Failed to assign admin role"**
- **Cause**: Database permission issue
- **Solution**: Check database connection and RLS policies

### **Debug Steps**
1. **Check Environment Variables**: Ensure all required vars are set
2. **Verify Supabase Connection**: Test database connectivity
3. **Check Database Tables**: Ensure migrations are applied
4. **Review Error Logs**: Check server logs for detailed errors

## 📋 **Environment Variables Required**

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Admin Setup (Optional)
ADMIN_SETUP_KEY=campusync-admin-setup-2024
```

## 🎉 **Success Indicators**

### **Setup Complete When:**
- ✅ Admin user created in Supabase Auth
- ✅ Admin role assigned in database
- ✅ Can login to admin dashboard
- ✅ Can access admin features
- ✅ Can create additional users

### **Verification Steps:**
1. **Login Test**: Try logging in with admin credentials
2. **Dashboard Access**: Verify admin dashboard loads
3. **User Management**: Check if you can view users
4. **Role Assignment**: Test assigning roles to users

## 🔄 **Reset Admin Setup**

### **If Setup Fails:**
1. **Delete Admin User**: Remove from Supabase Auth
2. **Clear Database**: Remove from `user_roles` table
3. **Restart Setup**: Run setup process again

### **Database Reset:**
```sql
-- Remove admin role
DELETE FROM user_roles WHERE role = 'admin';

-- Remove admin user (replace with actual user ID)
DELETE FROM auth.users WHERE id = 'admin-user-id';
```

## 📞 **Support**

### **If You Need Help:**
1. **Check Logs**: Review server and database logs
2. **Verify Setup**: Ensure all steps completed correctly
3. **Test Environment**: Verify all environment variables
4. **Contact Support**: Reach out for assistance

---

**🎯 Ready to create your first admin? Choose your preferred method and get started!**
