# 🔐 Admin Onboarding Guide

## Overview
This guide explains how to create the first admin user for CampusSync and manage admin access.

## 🚀 **Web Interface**

### **Step 1: Access Setup Page**
1. **Go to set up page in landing page**
2. **You'll see the admin setup form**

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
