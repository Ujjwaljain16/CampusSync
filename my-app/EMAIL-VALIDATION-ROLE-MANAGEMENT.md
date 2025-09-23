# 📧 Email Validation & Role Management System

## Overview
This document outlines the comprehensive email validation and role management system for CampusSync, ensuring only educational emails can sign up as students and proper role assignment for admins.

## 🎯 Key Features

### 1. **Email Domain Validation for Students**
- **Educational Domain Validation**: Only allows signup with valid educational email domains
- **Real-time Validation**: Shows validation errors as user types
- **Customizable Domain List**: Easy to add new educational institutions
- **Visual Feedback**: Clear error messages and visual indicators

### 2. **Role Management System**
- **Database-Driven Roles**: Uses `user_roles` table for role storage
- **Automatic Role Assignment**: New users get 'student' role by default
- **Admin Role Assignment**: Admins can assign roles to users
- **Fallback System**: Email-based fallback for existing admins

## 🔧 Implementation Details

### Email Validation Logic

```typescript
// Allowed educational domains
const allowedDomains = [
  'edu',           // Generic .edu domains
  'ac.uk',         // UK universities
  'ac.in',         // Indian universities
  'university.edu', // Example university
  'college.edu',   // Example college
  'institute.edu', // Example institute
  // Add more domains as needed
];

// Validation function
const validateStudentEmail = (email: string) => {
  const trimmedEmail = email.trim().toLowerCase();
  
  const isValidDomain = allowedDomains.some(domain => 
    trimmedEmail.endsWith(`@${domain}`) || 
    trimmedEmail.includes(`@${domain}.`)
  );
  
  if (!isValidDomain) {
    return {
      isValid: false,
      error: 'Please use a valid educational email address (e.g., student@university.edu)'
    };
  }
  
  return { isValid: true };
};
```

### Role Assignment System

#### Database Schema
```sql
CREATE TABLE user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);
```

#### Role Assignment Flow
1. **New User Signup**: Automatically assigned 'student' role
2. **Admin Role Assignment**: Admins can assign roles via admin panel
3. **Fallback System**: Email-based assignment for existing admins
4. **Database Priority**: Database roles take precedence over email-based

## 🚀 How It Works

### For Students (Signup Process)
1. **Email Input**: User enters email address
2. **Real-time Validation**: System checks if email ends with educational domain
3. **Visual Feedback**: Shows error if invalid domain
4. **Form Submission**: Only allows submission with valid educational email
5. **Account Creation**: Creates account with 'student' role

### For Admins (Role Management)
1. **Admin Access**: Only users with 'admin' role can access admin panel
2. **User Management**: View all users and their current roles
3. **Role Assignment**: Assign 'student', 'faculty', or 'admin' roles
4. **User Creation**: Create new users with specific roles
5. **Role Updates**: Change existing user roles

### For Faculty
1. **Faculty Access**: Users with 'faculty' role can access faculty dashboard
2. **Certificate Review**: Review and approve/reject student certificates
3. **Batch Operations**: Process multiple certificates at once

## 📋 Configuration

### Adding New Educational Domains
To add new educational domains, update the `allowedDomains` array in `/src/app/login/page.tsx`:

```typescript
const allowedDomains = [
  'edu',
  'ac.uk',
  'ac.in',
  'university.edu',
  'college.edu',
  'institute.edu',
  'your-university.edu',  // Add new domains here
  'another-college.ac.uk', // Add more as needed
];
```

### Adding New Admin Emails
To add new admin emails, update the `adminEmails` array in `/lib/supabaseServer.ts`:

```typescript
const adminEmails = [
  'jainujjwal1609@gmail.com',
  'admin@youruniversity.edu',  // Add new admin emails here
  'another-admin@college.edu', // Add more as needed
];
```

## 🔒 Security Features

### Email Validation Security
- **Client-side Validation**: Immediate feedback for better UX
- **Server-side Validation**: Double-check on form submission
- **Domain Whitelist**: Only pre-approved educational domains allowed
- **Case Insensitive**: Handles different email formats

### Role Management Security
- **Database-driven**: Roles stored securely in database
- **Admin-only Access**: Only admins can assign roles
- **Audit Trail**: Tracks who assigned roles and when
- **Fallback Protection**: Email-based fallback for existing admins

## 🎨 User Experience

### Student Signup Experience
1. **Clear Instructions**: Placeholder text shows expected email format
2. **Real-time Feedback**: Immediate validation as user types
3. **Error Messages**: Clear, helpful error messages
4. **Visual Indicators**: Red borders and warning icons for errors
5. **Disabled Submit**: Submit button disabled until valid email entered

### Admin Management Experience
1. **User List**: View all users with their roles and details
2. **Role Dropdown**: Easy role selection for each user
3. **Bulk Operations**: Select multiple users for batch operations
4. **Search/Filter**: Find users quickly
5. **Audit Information**: See who assigned roles and when

## 🚨 Error Handling

### Email Validation Errors
- **Invalid Domain**: "Please use a valid educational email address"
- **Empty Email**: "Email is required"
- **Invalid Format**: "Please enter a valid email address"

### Role Assignment Errors
- **Unauthorized**: "You don't have permission to assign roles"
- **User Not Found**: "User not found"
- **Invalid Role**: "Invalid role specified"
- **Database Error**: "Failed to assign role"

## 📊 Monitoring & Analytics

### Email Validation Metrics
- **Signup Attempts**: Track total signup attempts
- **Validation Failures**: Monitor invalid email attempts
- **Domain Usage**: See which educational domains are most used
- **Conversion Rate**: Track signup success rate

### Role Management Metrics
- **Role Assignments**: Track role assignment frequency
- **Admin Activity**: Monitor admin actions
- **User Growth**: Track user growth by role
- **Access Patterns**: Monitor dashboard access by role

## 🔄 Future Enhancements

### Planned Features
1. **Domain Verification**: Verify educational domains automatically
2. **Institution Integration**: Direct integration with university systems
3. **Bulk User Import**: Import users from CSV/Excel files
4. **Advanced Analytics**: Detailed reporting and analytics
5. **Email Templates**: Customizable email templates for invitations
6. **Two-Factor Authentication**: Enhanced security for admin accounts

### Integration Possibilities
1. **LDAP Integration**: Connect with university LDAP systems
2. **SSO Support**: Single Sign-On with educational institutions
3. **API Access**: RESTful API for external integrations
4. **Webhook Support**: Real-time notifications for role changes

## 🛠️ Technical Implementation

### Files Modified
- `/src/app/login/page.tsx` - Email validation logic
- `/lib/supabaseServer.ts` - Role management system
- `/src/app/api/auth/assign-role/route.ts` - Role assignment API
- `/src/app/admin/dashboard/page.tsx` - Admin interface

### Database Changes
- `user_roles` table for role storage
- Automatic role assignment trigger
- RLS policies for security

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations

## 📝 Usage Examples

### Student Signup
```typescript
// Valid educational emails
'student@university.edu'     // ✅ Valid
'john@college.edu'          // ✅ Valid
'jane@university.ac.uk'     // ✅ Valid
'admin@institute.edu'       // ✅ Valid

// Invalid emails
'user@gmail.com'            // ❌ Invalid
'student@company.com'       // ❌ Invalid
'admin@yahoo.com'           // ❌ Invalid
```

### Admin Role Assignment
```typescript
// Assign role via API
const response = await fetch('/api/auth/assign-role', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-uuid',
    role: 'faculty',
    adminEmail: 'admin@university.edu'
  })
});
```

## 🎯 Benefits

### For Students
- **Secure Access**: Only legitimate students can sign up
- **Clear Process**: Easy to understand signup requirements
- **Instant Feedback**: Know immediately if email is valid

### For Administrators
- **Full Control**: Complete control over user roles
- **Easy Management**: Simple interface for role assignment
- **Audit Trail**: Track all role changes
- **Scalable**: Handles growing user base

### For Faculty
- **Appropriate Access**: Only faculty can review certificates
- **Batch Operations**: Efficient certificate processing
- **Clear Interface**: Easy to use faculty dashboard

This system ensures that CampusSync maintains its educational focus while providing administrators with the tools they need to manage users effectively.
